# Diff: server/video/studio.ts

```diff
--- original_reference/server/video/studio.ts	2026-07-06 18:23:36.000000000 +0000
+++ audit/server/video/studio.ts	2026-07-09 19:13:43.196432572 +0000
@@ -76,7 +76,7 @@
   });
   const creditsUsed = estimateCredits(input.durationSeconds, input.outputType);
 
-  return db.saveVideoGeneration(input.workspaceId, input.product.id || "", {
+  return await db.saveVideoGeneration(input.workspaceId, input.product.id || "", {
     id: uuidv4(),
     productId: input.product.id || "",
     workspaceId: input.workspaceId,
@@ -110,7 +110,7 @@
   workspaceId: string,
   productId?: string
 ): Promise<VideoGenerationRecord[]> {
-  const items = db.getWorkspaceVideoGenerations(workspaceId, productId);
+  const items = await db.getWorkspaceVideoGenerations(workspaceId, productId);
   const now = Date.now();
 
   for (const item of items) {
@@ -121,7 +121,7 @@
     const elapsedSeconds = Math.max(0, (now - new Date(item.createdAt).getTime()) / 1000);
 
     if (item.status === "queued" && elapsedSeconds >= 1) {
-      db.updateVideoGeneration(workspaceId, item.id, {
+      await db.updateVideoGeneration(workspaceId, item.id, {
         status: "rendering",
         progress: 20,
       });
@@ -130,7 +130,7 @@
 
     if (item.status === "rendering") {
       const progress = Math.min(95, Math.round((elapsedSeconds / Math.max(1, item.estimatedRenderSeconds)) * 100));
-      db.updateVideoGeneration(workspaceId, item.id, {
+      await db.updateVideoGeneration(workspaceId, item.id, {
         progress: Math.max(item.progress, progress),
       });
 
@@ -146,7 +146,7 @@
             durationSeconds: item.durationSeconds,
             sourceImageUrls: item.sourceImageUrls,
           });
-          db.updateVideoGeneration(workspaceId, item.id, {
+          await db.updateVideoGeneration(workspaceId, item.id, {
             provider: result.provider,
             status: "completed",
             progress: 100,
@@ -157,20 +157,20 @@
             completedAt: new Date().toISOString(),
             errorMessage: undefined,
           });
-          db.logAudit(workspaceId, "VIDEO_RENDER_COMPLETED", `Completed AI video render ${item.id} with ${result.provider}.`);
+          await db.logAudit(workspaceId, "VIDEO_RENDER_COMPLETED", `Completed AI video render ${item.id} with ${result.provider}.`);
         } catch (error: any) {
-          db.updateVideoGeneration(workspaceId, item.id, {
+          await db.updateVideoGeneration(workspaceId, item.id, {
             status: "failed",
             progress: item.progress,
             errorMessage: error.message || "AI video rendering failed.",
           });
-          db.logAudit(workspaceId, "VIDEO_RENDER_FAILED", `Failed AI video render ${item.id}: ${error.message || "Unknown error"}`);
+          await db.logAudit(workspaceId, "VIDEO_RENDER_FAILED", `Failed AI video render ${item.id}: ${error.message || "Unknown error"}`);
         }
       }
     }
   }
 
-  return db.getWorkspaceVideoGenerations(workspaceId, productId);
+  return await db.getWorkspaceVideoGenerations(workspaceId, productId);
 }
 
 export async function renderQueuedVideo(
@@ -178,7 +178,7 @@
   workspaceId: string,
   videoId: string
 ): Promise<VideoGenerationRecord> {
-  const item = db.getVideoGenerationById(workspaceId, videoId);
+  const item = await db.getVideoGenerationById(workspaceId, videoId);
   if (!item) {
     throw new Error("AI video generation not found.");
   }
@@ -187,7 +187,7 @@
     return item;
   }
 
-  db.updateVideoGeneration(workspaceId, item.id, {
+  await db.updateVideoGeneration(workspaceId, item.id, {
     status: "rendering",
     progress: Math.max(item.progress, 20),
   });
@@ -203,7 +203,7 @@
       durationSeconds: item.durationSeconds,
       sourceImageUrls: item.sourceImageUrls,
     });
-    const updated = db.updateVideoGeneration(workspaceId, item.id, {
+    const updated = await db.updateVideoGeneration(workspaceId, item.id, {
       provider: result.provider,
       status: "completed",
       progress: 100,
@@ -214,18 +214,18 @@
       completedAt: new Date().toISOString(),
       errorMessage: undefined,
     });
-    db.logAudit(workspaceId, "VIDEO_RENDER_COMPLETED", `Completed AI video render ${item.id} with ${result.provider}.`);
+    await db.logAudit(workspaceId, "VIDEO_RENDER_COMPLETED", `Completed AI video render ${item.id} with ${result.provider}.`);
     if (!updated) {
       throw new Error("Failed to persist AI video completion.");
     }
     return updated;
   } catch (error: any) {
-    db.updateVideoGeneration(workspaceId, item.id, {
+    await db.updateVideoGeneration(workspaceId, item.id, {
       status: "failed",
       progress: item.progress,
       errorMessage: error.message || "AI video rendering failed.",
     });
-    db.logAudit(workspaceId, "VIDEO_RENDER_FAILED", `Failed AI video render ${item.id}: ${error.message || "Unknown error"}`);
+    await db.logAudit(workspaceId, "VIDEO_RENDER_FAILED", `Failed AI video render ${item.id}: ${error.message || "Unknown error"}`);
     throw error;
   }
 }
```
