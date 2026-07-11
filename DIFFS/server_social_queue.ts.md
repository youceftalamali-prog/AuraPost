# Diff: server/social/queue.ts

```diff
--- original_reference/server/social/queue.ts	2026-07-06 18:23:36.000000000 +0000
+++ audit/server/social/queue.ts	2026-07-09 19:27:22.083942666 +0000
@@ -6,42 +6,43 @@
   workspaceId: string,
   postId: string
 ) {
-  const post = db.getSocialPostById(workspaceId, postId);
+  const post = await db.getSocialPostById(workspaceId, postId);
   if (!post) {
     throw new Error("Social post not found.");
   }
 
+  const socialAccounts = await db.getSocialAccounts(workspaceId);
   const account = post.socialAccountId
-    ? db.getSocialAccounts(workspaceId).find((item) => item.id === post.socialAccountId)
-    : db.getSocialAccounts(workspaceId).find((item) => item.platform === post.platform);
+    ? socialAccounts.find((item) => item.id === post.socialAccountId)
+    : socialAccounts.find((item) => item.platform === post.platform);
 
-  db.updateSocialPostStatus(workspaceId, postId, {
+  await db.updateSocialPostStatus(workspaceId, postId, {
     status: "publishing",
     socialAccountId: account?.id,
   });
 
   try {
     const publishResult = await SocialPublisherService.publish(post, account);
-    const updated = db.updateSocialPostStatus(workspaceId, postId, {
+    const updated = await db.updateSocialPostStatus(workspaceId, postId, {
       status: "published",
       publishedAt: publishResult.publishedAt,
       externalPostId: publishResult.externalPostId,
       metrics: publishResult.metrics,
       socialAccountId: account?.id,
     });
-    db.logAudit(
+    await db.logAudit(
       workspaceId,
       "SOCIAL_POST_PUBLISHED",
       `Published ${post.platform} post ${post.id} using ${publishResult.integrationMode} integration mode.`
     );
     return updated;
   } catch (err: any) {
-    const failed = db.updateSocialPostStatus(workspaceId, postId, {
+    const failed = await db.updateSocialPostStatus(workspaceId, postId, {
       status: "failed",
       failureReason: err.message || "Publishing failed.",
       socialAccountId: account?.id,
     });
-    db.logAudit(workspaceId, "SOCIAL_POST_FAILED", `Failed publishing post ${post.id}: ${err.message || "Unknown error"}`);
+    await db.logAudit(workspaceId, "SOCIAL_POST_FAILED", `Failed publishing post ${post.id}: ${err.message || "Unknown error"}`);
     throw new Error(failed?.failureReason || err.message || "Publishing failed.");
   }
 }
```
