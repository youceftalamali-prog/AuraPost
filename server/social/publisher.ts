import fs from "fs";
import path from "path";
import {
  SocialAccount,
  SocialPlatform,
  SocialPost,
  SocialPostMetrics,
} from "../../src/types.ts";

interface PublishResult {
  externalPostId: string;
  publishedAt: string;
  integrationMode: "live";
  metrics: SocialPostMetrics;
}

const PLATFORM_CONFIG: Record<SocialPlatform, {
  label: string;
  apiBaseUrl: string;
  envTokenKey: string;
}> = {
  facebook: {
    label: "Facebook",
    apiBaseUrl: "https://graph.facebook.com/v19.0",
    envTokenKey: "META_GRAPH_API_TOKEN",
  },
  instagram: {
    label: "Instagram",
    apiBaseUrl: "https://graph.facebook.com/v19.0",
    envTokenKey: "META_GRAPH_API_TOKEN",
  },
  tiktok: {
    label: "TikTok",
    apiBaseUrl: "https://open.tiktokapis.com/v2",
    envTokenKey: "TIKTOK_API_TOKEN",
  },
  pinterest: {
    label: "Pinterest",
    apiBaseUrl: "https://api.pinterest.com/v5",
    envTokenKey: "PINTEREST_API_TOKEN",
  },
  x: {
    label: "X",
    apiBaseUrl: "https://api.twitter.com/2",
    envTokenKey: "X_API_TOKEN",
  },
  linkedin: {
    label: "LinkedIn",
    apiBaseUrl: "https://api.linkedin.com/v2",
    envTokenKey: "LINKEDIN_API_TOKEN",
  },
  youtube_shorts: {
    label: "YouTube Shorts",
    apiBaseUrl: "https://www.googleapis.com/youtube/v3",
    envTokenKey: "YOUTUBE_API_TOKEN",
  },
};

async function saveMetaDiagnostics(params: {
  platform: "facebook" | "instagram";
  status: "success" | "failed";
  tokenUsed: string;
  exactRequest: {
    method: string;
    endpoint: string;
    headers: Record<string, string>;
    body: any;
  };
  exactResponse: {
    status: number;
    statusText: string;
    body: string;
  };
}) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  
  let pageTokenDebug: any = null;
  if (appId && appSecret && params.tokenUsed) {
    try {
      const debugUrl = `https://graph.facebook.com/v19.0/debug_token?input_token=${params.tokenUsed}&access_token=${appId}|${appSecret}`;
      const response = await fetch(debugUrl);
      if (response.ok) {
        pageTokenDebug = await response.json();
      }
    } catch (e) {
      console.error("[saveMetaDiagnostics] Error debugging page token:", e);
    }
  }

  let userTokenDebug: any = null;
  const userTokenDebugPath = path.join(process.cwd(), "storage", "meta_user_token_debug.json");
  if (fs.existsSync(userTokenDebugPath)) {
    try {
      userTokenDebug = JSON.parse(fs.readFileSync(userTokenDebugPath, "utf8"));
    } catch (e) {
      console.error("[saveMetaDiagnostics] Error reading user token debug file:", e);
    }
  }

  const report = {
    timestamp: new Date().toISOString(),
    platform: params.platform,
    status: params.status,
    userAccessTokenPermissions: userTokenDebug ? (userTokenDebug.data || userTokenDebug) : {
      info: "No user OAuth debug log was found. Please authenticate via OAuth first."
    },
    pageAccessTokenPermissions: pageTokenDebug ? (pageTokenDebug.data || pageTokenDebug) : {
      info: "Could not debug Page Access Token. Please verify META_APP_ID and META_APP_SECRET are set."
    },
    instagramBusinessPermissions: params.platform === "instagram" ? {
      info: "Requires 'instagram_business_basic' and 'instagram_business_content_publish' scopes to post to Instagram Business Accounts.",
      status: pageTokenDebug?.data?.scopes?.includes("instagram_business_content_publish") ? "Authorized" : "Unauthorized"
    } : {
      info: "Not applicable for Facebook page posting."
    },
    exactRequest: {
      ...params.exactRequest,
      body: typeof params.exactRequest.body === "string" ? params.exactRequest.body : JSON.stringify(params.exactRequest.body)
    },
    exactResponse: params.exactResponse
  };

  const diagnosticsPath = path.join(process.cwd(), "storage", "meta_diagnostics.json");
  try {
    const dir = path.dirname(diagnosticsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(diagnosticsPath, JSON.stringify(report, null, 2), "utf8");
    console.log(`[SocialPublisherService] Meta Diagnostics Report saved to ${diagnosticsPath}`);
  } catch (e) {
    console.error("[saveMetaDiagnostics] Error writing diagnostics file:", e);
  }
}

async function publishToInstagram(post: SocialPost, account: SocialAccount): Promise<string> {
  const token = account.accessToken || process.env[PLATFORM_CONFIG.instagram.envTokenKey];
  if (!token) {
    throw new Error("Publishing not implemented");
  }
  const instagramBusinessAccountId = account.platformUserId;
  if (!instagramBusinessAccountId) {
    throw new Error("Instagram Business Account ID is missing.");
  }

  const mediaUrl = post.mediaUrls && post.mediaUrls.length > 0 ? post.mediaUrls[0] : null;
  if (!mediaUrl) {
    throw new Error("Instagram publishing requires at least one image or video media URL.");
  }

  const isVideo = mediaUrl.toLowerCase().match(/\.(mp4|mov|avi|mkv|webm)($|\?)/);

  const hashtagsStr = post.hashtags && post.hashtags.length > 0
    ? post.hashtags.map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)).join(" ")
    : "";
  const fullCaption = hashtagsStr ? `${post.caption}\n\n${hashtagsStr}` : post.caption;

  console.log(`[SocialPublisherService] Initiating Instagram Publishing (Step 1: Container Creation)`);
  
  const containerEndpoint = `https://graph.facebook.com/v19.0/${instagramBusinessAccountId}/media`;
  
  const containerParams: Record<string, string> = {
    access_token: token,
    caption: fullCaption,
  };

  if (isVideo) {
    containerParams.media_type = "VIDEO";
    containerParams.video_url = mediaUrl;
  } else {
    containerParams.image_url = mediaUrl;
  }

  const step1Response = await fetch(containerEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(containerParams),
  });

  if (!step1Response.ok) {
    const errorBody = await step1Response.text();
    console.error(`[SocialPublisherService] Instagram Step 1 Failed: HTTP ${step1Response.status}`, {
      endpoint: containerEndpoint,
      response: errorBody,
    });
    
    await saveMetaDiagnostics({
      platform: "instagram",
      status: "failed",
      tokenUsed: token,
      exactRequest: {
        method: "POST",
        endpoint: containerEndpoint,
        headers: { "Content-Type": "application/json" },
        body: { ...containerParams, access_token: "MASKED" }
      },
      exactResponse: {
        status: step1Response.status,
        statusText: step1Response.statusText,
        body: errorBody
      }
    });

    throw new Error(`Instagram publishing container creation failed: ${errorBody || step1Response.statusText}`);
  }

  const step1Data = await step1Response.json() as { id: string };
  const containerId = step1Data.id;
  if (!containerId) {
    throw new Error("Instagram container ID not received from Graph API.");
  }

  console.log(`[SocialPublisherService] Instagram Step 1 Success. Container ID: ${containerId}`);

  if (isVideo) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  console.log(`[SocialPublisherService] Instagram Step 2: Publish Media Container`);
  const publishEndpoint = `https://graph.facebook.com/v19.0/${instagramBusinessAccountId}/media_publish`;
  
  const step2Params = {
    access_token: token,
    creation_id: containerId,
  };

  const step2Response = await fetch(publishEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(step2Params),
  });

  if (!step2Response.ok) {
    const errorBody = await step2Response.text();
    console.error(`[SocialPublisherService] Instagram Step 2 Failed: HTTP ${step2Response.status}`, {
      endpoint: publishEndpoint,
      response: errorBody,
    });

    await saveMetaDiagnostics({
      platform: "instagram",
      status: "failed",
      tokenUsed: token,
      exactRequest: {
        method: "POST",
        endpoint: publishEndpoint,
        headers: { "Content-Type": "application/json" },
        body: { ...step2Params, access_token: "MASKED" }
      },
      exactResponse: {
        status: step2Response.status,
        statusText: step2Response.statusText,
        body: errorBody
      }
    });

    throw new Error(`Instagram publishing finalization failed: ${errorBody || step2Response.statusText}`);
  }

  const step2Data = await step2Response.json() as { id: string };
  const instagramPostId = step2Data.id;
  if (!instagramPostId) {
    throw new Error("Instagram final Post ID not received from Graph API.");
  }

  console.log(`[SocialPublisherService] Instagram Step 3: Success. Published Post ID: ${instagramPostId}`);

  await saveMetaDiagnostics({
    platform: "instagram",
    status: "success",
    tokenUsed: token,
    exactRequest: {
      method: "POST",
      endpoint: publishEndpoint,
      headers: { "Content-Type": "application/json" },
      body: { ...step2Params, access_token: "MASKED" }
    },
    exactResponse: {
      status: step2Response.status,
      statusText: step2Response.statusText,
      body: JSON.stringify(step2Data)
    }
  });

  return instagramPostId;
}

async function publishToFacebook(post: SocialPost, account: SocialAccount): Promise<string> {
  const token = account.accessToken || process.env[PLATFORM_CONFIG.facebook.envTokenKey];
  if (!token) {
    throw new Error("Publishing not implemented");
  }
  const pageId = account.platformUserId;
  if (!pageId) {
    throw new Error("Facebook Page ID is missing.");
  }

  const hashtagsStr = post.hashtags && post.hashtags.length > 0
    ? post.hashtags.map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)).join(" ")
    : "";
  const fullCaption = hashtagsStr ? `${post.caption}\n\n${hashtagsStr}` : post.caption;

  const mediaUrl = post.mediaUrls && post.mediaUrls.length > 0 ? post.mediaUrls[0] : null;

  console.log(`[SocialPublisherService] Initiating Facebook Page Publishing`);

  let endpoint = `https://graph.facebook.com/v19.0/${pageId}/feed`;
  const params: Record<string, string> = {
    access_token: token,
  };

  if (mediaUrl) {
    const isVideo = mediaUrl.toLowerCase().match(/\.(mp4|mov|avi|mkv|webm)($|\?)/);
    if (isVideo) {
      endpoint = `https://graph.facebook.com/v19.0/${pageId}/videos`;
      params.description = fullCaption;
      params.file_url = mediaUrl;
    } else {
      endpoint = `https://graph.facebook.com/v19.0/${pageId}/photos`;
      params.caption = fullCaption;
      params.url = mediaUrl;
    }
  } else {
    params.message = fullCaption;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[SocialPublisherService] Facebook Publishing Failed: HTTP ${response.status}`, {
      endpoint,
      response: errorBody,
    });

    await saveMetaDiagnostics({
      platform: "facebook",
      status: "failed",
      tokenUsed: token,
      exactRequest: {
        method: "POST",
        endpoint,
        headers: { "Content-Type": "application/json" },
        body: { ...params, access_token: "MASKED" }
      },
      exactResponse: {
        status: response.status,
        statusText: response.statusText,
        body: errorBody
      }
    });

    throw new Error(`Facebook Page publishing failed: ${errorBody || response.statusText}`);
  }

  const data = await response.json() as { id?: string; post_id?: string };
  const postId = data.id || data.post_id;
  if (!postId) {
    throw new Error("Facebook Post ID not received from Graph API.");
  }

  console.log(`[SocialPublisherService] Facebook Publishing Success. Post ID: ${postId}`);

  await saveMetaDiagnostics({
    platform: "facebook",
    status: "success",
    tokenUsed: token,
    exactRequest: {
      method: "POST",
      endpoint,
      headers: { "Content-Type": "application/json" },
      body: { ...params, access_token: "MASKED" }
    },
    exactResponse: {
      status: response.status,
      statusText: response.statusText,
      body: JSON.stringify(data)
    }
  });

  return postId;
}

export class SocialPublisherService {
  public static getPlatformConfiguration(platform: SocialPlatform) {
    return PLATFORM_CONFIG[platform];
  }

  public static resolveIntegrationMode(account?: SocialAccount): "live" {
    return "live";
  }

  public static async publish(post: SocialPost, account?: SocialAccount): Promise<PublishResult> {
    const isLiveEnabled = process.env.SOCIAL_PUBLISH_LIVE === "true";
    
    if (!isLiveEnabled || !account) {
      throw new Error("Publishing not implemented");
    }

    const publishedAt = new Date().toISOString();

    if (post.platform === "instagram") {
      const externalPostId = await publishToInstagram(post, account);
      return {
        externalPostId,
        publishedAt,
        integrationMode: "live",
        metrics: {
          engagement: 0,
          reach: 0,
          clicks: 0,
          impressions: 0,
        },
      };
    } else if (post.platform === "facebook") {
      const externalPostId = await publishToFacebook(post, account);
      return {
        externalPostId,
        publishedAt,
        integrationMode: "live",
        metrics: {
          engagement: 0,
          reach: 0,
          clicks: 0,
          impressions: 0,
        },
      };
    } else {
      throw new Error("Publishing not implemented");
    }
  }
}
