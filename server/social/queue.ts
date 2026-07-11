import { DatabaseManager } from "../db.ts";
import { SocialPublisherService } from "./publisher.ts";

export async function publishQueuedSocialPost(
  db: DatabaseManager,
  workspaceId: string,
  postId: string
) {
  const post = await db.getSocialPostById(workspaceId, postId);
  if (!post) {
    throw new Error("Social post not found.");
  }

  const socialAccounts = await db.getSocialAccounts(workspaceId);
  const account = post.socialAccountId
    ? socialAccounts.find((item) => item.id === post.socialAccountId)
    : socialAccounts.find((item) => item.platform === post.platform);

  await db.updateSocialPostStatus(workspaceId, postId, {
    status: "publishing",
    socialAccountId: account?.id,
  });

  try {
    const publishResult = await SocialPublisherService.publish(post, account);
    const updated = await db.updateSocialPostStatus(workspaceId, postId, {
      status: "published",
      publishedAt: publishResult.publishedAt,
      externalPostId: publishResult.externalPostId,
      metrics: publishResult.metrics,
      socialAccountId: account?.id,
    });
    await db.logAudit(
      workspaceId,
      "SOCIAL_POST_PUBLISHED",
      `Published ${post.platform} post ${post.id} using ${publishResult.integrationMode} integration mode.`
    );
    return updated;
  } catch (err: any) {
    const failed = await db.updateSocialPostStatus(workspaceId, postId, {
      status: "failed",
      failureReason: err.message || "Publishing failed.",
      socialAccountId: account?.id,
    });
    await db.logAudit(workspaceId, "SOCIAL_POST_FAILED", `Failed publishing post ${post.id}: ${err.message || "Unknown error"}`);
    throw new Error(failed?.failureReason || err.message || "Publishing failed.");
  }
}
