# Diff: src/components/ImageStudio.tsx

```diff
--- original_reference/src/components/ImageStudio.tsx	2026-07-06 18:23:36.000000000 +0000
+++ audit/src/components/ImageStudio.tsx	2026-07-09 19:30:07.134123259 +0000
@@ -685,7 +685,7 @@
     setLayers(next);
   };
 
-  // SQLite Projects CRUD
+  // Image Studio Projects CRUD (PostgreSQL-backed)
   const loadProjects = async () => {
     setLoadingProjects(true);
     try {
@@ -697,7 +697,7 @@
         setProjectsList(list);
       }
     } catch (err) {
-      console.error("Error loading SQLite image projects:", err);
+      console.error("Error loading image projects:", err);
     } finally {
       setLoadingProjects(false);
     }
@@ -724,7 +724,7 @@
       if (response.ok) {
         const res = await response.json();
         setActiveProjectId(res.id);
-        onAddAuditLog("image.project_save", `Saved project "${projectTitle}" into SQLite cloud database`);
+        onAddAuditLog("image.project_save", `Saved project "${projectTitle}" to the cloud database`);
         alert(`Success! Project "${projectTitle}" has been saved.`);
         loadProjects();
       }
```
