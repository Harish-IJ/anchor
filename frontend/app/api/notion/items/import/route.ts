import { NextRequest } from "next/server";
import { supabase } from "@/lib/database";
import { successResponse, errorResponse } from "@/lib/api-utils";
import Papa from "papaparse";
import AdmZip from "adm-zip";

import crypto from "crypto";

// Default fallback source, better to pass source_key in form
const DEFAULT_MANUAL_SOURCE_DB_ID = "csv_manual_import";
const MAX_UNZIPPED_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_FILES = 10;

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
    let filtersJson = req.nextUrl.searchParams.get("filters");

    let sourceKey = req.nextUrl.searchParams.get("source_key") || DEFAULT_MANUAL_SOURCE_DB_ID;
    if (!sourceKey.startsWith("manual_")) sourceKey = `manual_${sourceKey}`;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as Blob | null;
      
      const formFilters = formData.get("filters");
      if (formFilters && typeof formFilters === "string") {
        filtersJson = formFilters;
      }
      
      const formSourceKey = formData.get("source_key");
      if (formSourceKey && typeof formSourceKey === "string") {
        sourceKey = formSourceKey;
        if (!sourceKey.startsWith("manual_")) sourceKey = `manual_${sourceKey}`;
      }

      if (!file) {
        return errorResponse("No file uploaded", 400);
      }

      if (file.size > MAX_UNZIPPED_SIZE) {
        return errorResponse("File too large before extraction.", 400);
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
      const contentLength = req.headers.get("content-length");
      if (contentLength && parseInt(contentLength) > MAX_UNZIPPED_SIZE) {
        return errorResponse("Payload exceeds size limit.", 413);
      }
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
          if (innerZipEntry.header.size > MAX_UNZIPPED_SIZE) return errorResponse("Inner ZIP too large", 400);
          console.log(`Found nested ZIP file (${innerZipEntry.entryName}), extracting inner contents...`);
          const innerZipBuffer = innerZipEntry.getData();
          const innerZip = new AdmZip(innerZipBuffer);
          csvEntries = innerZip.getEntries().filter(e => e.entryName.endsWith(".csv"));
        }
      }
      
      if (csvEntries.length === 0) {
        return errorResponse("No CSV files found inside the uploaded ZIP", 400);
      }
      
      if (csvEntries.length > MAX_FILES) {
        return errorResponse("Too many files in ZIP.", 400);
      }

      console.log(`Extracting and parsing ${csvEntries.length} CSV file(s) from zip...`);
      let totalExtractedSize = 0;

      for (const csvEntry of csvEntries) {
        if (csvEntry.header.size > MAX_UNZIPPED_SIZE) return errorResponse("CSV entry too large", 400);
        const contentBuffer = csvEntry.getData();
        totalExtractedSize += contentBuffer.length;
        
        if (totalExtractedSize > MAX_UNZIPPED_SIZE) {
          return errorResponse("ZIP extraction exceeded size limit.", 400);
        }

        const content = contentBuffer.toString("utf8");
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

    // Apply Dynamic Filters If Provided
    if (filtersJson) {
      let filters: Record<string, string[]> = {};
      try {
        filters = JSON.parse(filtersJson);
      } catch {
        return errorResponse("Invalid filters format. Must be a JSON object mapping column names to arrays of acceptable values (e.g. {\"Task owner\": [\"TEST_USER\"]}).", 400);
      }

      if (Object.keys(filters).length > 0) {
        rows = rows.filter((row) => {
          // OR Logic: Keep row if AT LEAST ONE of the conditions matches.
          // This allows users to match themselves across multiple assignment fields (Owner, Participant, etc)
          let matchesAny = false;
          
          for (const [filterKey, filterValues] of Object.entries(filters)) {
            const acceptableValues = Array.isArray(filterValues) ? filterValues : [filterValues];
            const rowValue = row[filterKey];
            
            if (rowValue) {
              const hasMatch = acceptableValues.some(val => 
                rowValue.toString().toLowerCase().includes(val.toString().toLowerCase())
              );
              if (hasMatch) {
                matchesAny = true;
                break;
              }
            }
          }
          
          return matchesAny;
        });

        console.log(`Rows remaining after dynamic filtering: ${rows.length}`);
        
        if (rows.length === 0) {
          return errorResponse("No rows matched the provided filters", 400);
        }
      }
    }

    // 3. Ensure Manual Source Exists
    const { data: initialSource, error: sourceError } = await supabase
      .from("notion_sources")
      .select("id")
      .eq("database_id", sourceKey)
      .maybeSingle();

    if (sourceError) {
      throw sourceError;
    }

    let source = initialSource;

    if (!source) {
      const { data: newSource, error: createError } = await supabase
        .from("notion_sources")
        .insert([{
          database_id: sourceKey,
          name: `Manual Import: ${sourceKey}`,
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
        // Fallback: use the raw title + hash as part of the unique key to prevent collisions
        const hash = crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex').substring(0, 8);
        pageId = `csv-fallback-${title}-${hash}`;
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

/**
 * DELETE /api/notion/items/import
 * Reverts the manual CSV import by deleting all items associated with the manual source.
 */
export async function DELETE(req: NextRequest) {
  try {
    let sourceKey = req.nextUrl.searchParams.get("source_key") || DEFAULT_MANUAL_SOURCE_DB_ID;
    if (!sourceKey.startsWith("manual_")) sourceKey = `manual_${sourceKey}`;

    // 1. Find the Manual Source
    const { data: source, error: sourceError } = await supabase
      .from("notion_sources")
      .select("id")
      .eq("database_id", sourceKey)
      .maybeSingle();

    if (sourceError || !source) {
      return successResponse({ message: "No manual import source found to revert." });
    }

    // 2. Delete all items belonging to this source
    // Since we don't have batch IDs, this clears ALL manually imported CSV items.
    const { error: deleteError, count } = await supabase
      .from("notion_items")
      .delete({ count: "exact" })
      .eq("source_id", source.id);

    if (deleteError) {
      throw deleteError;
    }

    return successResponse({ 
      reverted_count: count || 0,
      message: `Successfully reverted import. ${count || 0} items deleted.` 
    });

  } catch (error: unknown) {
    console.error("Error reverting CSV import:", error);
    return errorResponse(error instanceof Error ? error.message : "Error reverting CSV import", 500);
  }
}
