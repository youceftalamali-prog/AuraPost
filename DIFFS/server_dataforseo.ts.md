# Diff: server/dataforseo.ts

```diff
--- original_reference/server/dataforseo.ts	2026-07-06 18:23:36.000000000 +0000
+++ audit/server/dataforseo.ts	2026-07-09 05:59:33.930751016 +0000
@@ -22,37 +22,14 @@
    */
   public static async getCredentials(workspaceId: string): Promise<DataForSEOCredentials> {
     const db = await DatabaseManager.getInstance();
-    const providers = db.getAIProviders(workspaceId);
-    
+    const providers = await db.getAIProviders(workspaceId);
+
     // We treat "dataforseo" as a custom provider entry
     const provider = providers.find(p => (p.provider as string) === "dataforseo");
     if (!provider) {
       return { login: "", hasPassword: false };
     }
 
-    // Since we want to get the raw password, we need to decrypt it.
-    // Let's retrieve it directly or let the DB manager decrypt it.
-    // Wait, getAIProviders already decrypts the apiKey if we have DB access. Let's see if apiKey is populated.
-    // In server/db.ts, getAIProviders returns:
-    // { provider, isEnabled, priority, hasApiKey: !!apiKey, defaultModel: row.default_model, ... }
-    // Let's write a direct helper to decrypt the apiKey for 'dataforseo' if needed.
-    // Or we can query the DB directly to decrypt.
-    let decryptedPassword = "";
-    try {
-      const dbInstance = await DatabaseManager.getInstance();
-      const rawProviders = dbInstance.getAIProviders(workspaceId);
-      const target = rawProviders.find(p => (p.provider as string) === "dataforseo");
-      
-      // Let's implement a direct decryption method or query the table
-      // Let's look at how server/db.ts decrypts:
-      // Oh, does server/db.ts decrypt the keys?
-      // Let's check how the keys are checked or if there is a decrypt helper.
-    } catch (e) {
-      console.error("Error reading credentials:", e);
-    }
-
-    // Let's read the raw encrypted key from the database and decrypt it ourselves using the same key
-    // Let's do that! First let's check how decryption is done in server/db.ts or server/encryption.ts.
     return {
       login: provider.defaultModel || "",
       hasPassword: provider.hasApiKey,
@@ -61,26 +38,20 @@
 
   /**
    * Decrypts the password for DataForSEO
+   *
+   * PHASE 2 CUTOVER: previously reached directly into DatabaseManager's private
+   * internals via `(dbInstance as any).db` to run a raw sql.js prepare/bind/
+   * step/free query, bypassing all encapsulation (and using `as any` specifically
+   * to defeat TypeScript's checking, since "dataforseo" wasn't part of the
+   * AIProviderName type). That escape hatch no longer exists — this now calls
+   * DatabaseManager's own public, encrypted, parameterized accessor, same as
+   * every other provider.
    */
   private static async getDecryptedPassword(workspaceId: string): Promise<string> {
     try {
       const dbInstance = await DatabaseManager.getInstance();
-      // Let's run a direct query to decrypt
-      // Since dbInstance.db is a raw sql.js instance, we can prepare a statement
-      const sqlDb = (dbInstance as any).db;
-      if (!sqlDb) return "";
-      
-      const stmt = sqlDb.prepare(
-        "SELECT api_key_encrypted, api_key_iv FROM workspace_ai_providers WHERE workspace_id = $workspaceId AND provider = $provider LIMIT 1"
-      );
-      stmt.bind({ $workspaceId: workspaceId, $provider: "dataforseo" });
-      const row = stmt.step() ? stmt.getAsObject() : null;
-      stmt.free();
-
-      if (row && row.api_key_encrypted && row.api_key_iv) {
-        const { decrypt } = await import("./encryption.ts");
-        return decrypt(row.api_key_encrypted, row.api_key_iv);
-      }
+      const key = await dbInstance.getAIProviderApiKey(workspaceId, "dataforseo", false);
+      return key || "";
     } catch (err) {
       console.error("Error decrypting DataForSEO password:", err);
     }
```
