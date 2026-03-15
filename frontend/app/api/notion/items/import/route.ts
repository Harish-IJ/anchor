import { NextRequest } from "next/server";
import { supabase } from "@/lib/database";
import { successResponse, errorResponse } from "@/lib/api-utils";
import Papa from "papaparse";
import AdmZip from "adm-zip";

const MANUAL_SOURCE_DB_ID = "csv_manual_import";
const MANUAL_SOURCE_NAME = "Manual CSV Import";

/**
 * POST /api/notion/items/import
 * Accepts a CSV file via multipart/form-data.
 * Parses it and upserts rows into `notion_items` under a manual source.
 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let fileContent = "";
    let isZip = false;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as Blob | null;

      if (!file) {
        return errorResponse("No file uploaded", 400);
      }

      const fileName = (file as File).name || "";
      isZip = fileName.endsWith(".zip") || file.type === "application/zip" || file.type === "application/x-zip-compressed";

      if (isZip) {
        const arrayBuffer = await file.arrayBuffer();
        fileContent = Buffer.from(arrayBuffer).toString("base64"); // Temporary hold for zip processing
      } else {
        fileContent = await file.text();
      }
    } else {
      // Handle raw body upload (File / Binary in Bruno)
      console.log("Processing raw body upload...");
      const arrayBuffer = await req.arrayBuffer();
      
      // We can infer if it's a ZIP by checking the magic number or if content-type says zip
      // Magic number for ZIP is 50 4B 03 04 (PK\x03\x04)
      const buffer = Buffer.from(arrayBuffer);
      isZip = contentType.includes("application/zip") || (buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4B);

      if (isZip) {
        fileContent = buffer.toString("base64");
      } else {
        fileContent = buffer.toString("utf-8");
      }
    }

    let rows: Record<string, string>[] = [];

    if (isZip) {
      console.log("Processing ZIP file upload...");
      const buffer = Buffer.from(fileContent, "base64");
      const zip = new AdmZip(buffer);
      
      const zipEntries = zip.getEntries();
      
      // Find ALL CSV files in the zip:
      let csvEntries = zipEntries.filter(e => e.entryName.endsWith(".csv"));
      
      // Notion sometimes exports as a double-zip (a zip inside a zip)
      if (csvEntries.length === 0) {
        const innerZipEntry = zipEntries.find(e => e.entryName.endsWith(".zip"));
        if (innerZipEntry) {
          console.log(`Found nested ZIP file (${innerZipEntry.entryName}), extracting inner contents...`);
          const innerZipBuffer = innerZipEntry.getData();
          const innerZip = new AdmZip(innerZipBuffer);
          csvEntries = innerZip.getEntries().filter(e => e.entryName.endsWith(".csv"));
        }
      }
      
      if (csvEntries.length === 0) {
        return errorResponse("No CSV files found inside the uploaded ZIP", 400);
      }

      console.log(`Extracting and parsing ${csvEntries.length} CSV file(s) from zip...`);
      for (const csvEntry of csvEntries) {
        const content = csvEntry.getData().toString("utf8");
        const parsed = Papa.parse(content, {
          header: true,
          skipEmptyLines: true,
        });

        if (parsed.errors.length > 0) {
          console.warn(`CSV parse warnings inside ${csvEntry.entryName}:`, parsed.errors);
        }
        rows = rows.concat(parsed.data as Record<string, string>[]);
      }
    } else {
      // 2. Parse Single CSV
      const parsed = Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
      });

      if (parsed.errors.length > 0) {
        console.warn("CSV parse warnings:", parsed.errors);
      }

      rows = parsed.data as Record<string, string>[];
    }

    if (rows.length === 0) {
      return errorResponse("CSV files are empty or missing headers", 400);
    }

    // 3. Ensure Manual Source Exists
    const { data: initialSource, error: sourceError } = await supabase
      .from("notion_sources")
      .select("id")
      .eq("database_id", MANUAL_SOURCE_DB_ID)
      .single();

    let source = initialSource;

    if (!source || sourceError) {
      const { data: newSource, error: createError } = await supabase
        .from("notion_sources")
        .insert([{
          database_id: MANUAL_SOURCE_DB_ID,
          name: MANUAL_SOURCE_NAME,
          sync_enabled: false
        }])
        .select("id")
        .single();

      if (createError) throw createError;
      source = newSource;
    }

    const sourceId = source.id;

    // 4. Map Rows to Notion Items
    const itemsToUpsert = [];
    
    for (const row of rows) {
      // 1. Find Title Column
      const titleKey = Object.keys(row).find(key => {
        const lower = key.toLowerCase();
        return lower === "title" || lower === "name" || lower === "task name" || lower === "subject" || lower === "task";
      });
      const title = titleKey && row[titleKey] ? row[titleKey].trim() : "Untitled CSV Item";

      // 2. Find ID Column
      const idKey = Object.keys(row).find(key => {
        const lower = key.toLowerCase();
        return lower === "id" || lower.includes("url") || lower.includes("link");
      });
      
      let pageId = "";
      if (idKey && row[idKey] && row[idKey].trim().length > 0) {
        pageId = `csv-id-${row[idKey].trim()}`;
      } else {
        // Fallback: use the raw title as part of the unique key
        pageId = `csv-title-${title}`;
      }

      itemsToUpsert.push({
        source_id: sourceId,
        notion_page_id: pageId, // Unique constraint
        title: title,
        properties: row,
        is_deleted: false,
        last_synced_at: new Date().toISOString()
      });
    }

    // 5. Deduplicate and upsert items in chunks
    const uniqueItemsMap = new Map();
    for (const item of itemsToUpsert) {
      uniqueItemsMap.set(item.notion_page_id, item);
    }
    const deduplicatedItems = Array.from(uniqueItemsMap.values());

    // Batch upsert into chunks of 500
    const chunkSize = 500;
    for (let i = 0; i < deduplicatedItems.length; i += chunkSize) {
      const chunk = deduplicatedItems.slice(i, i + chunkSize);
      
      const { error: upsertError } = await supabase
        .from("notion_items")
        .upsert(chunk, { 
          onConflict: "notion_page_id",
          ignoreDuplicates: false 
        });

      if (upsertError) {
        throw new Error(`Upsert error at chunk ${i}: ${upsertError.message}`);
      }
    }

    return successResponse({ 
      imported_count: deduplicatedItems.length,
      message: `Successfully imported ${deduplicatedItems.length} items from CSV.`
    }, 201);

  } catch (error: unknown) {
    console.error("Error importing CSV:", error);
    return errorResponse(error instanceof Error ? error.message : "Error importing CSV", 500);
  }
}
