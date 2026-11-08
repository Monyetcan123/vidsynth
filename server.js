/**
 * VIDSYNTH AI — PRODUCTION EXPRESS BACKEND, AUTHENTICATION, CREDIT LEDGER & AI IMAGE ENGINE (server.js)
 * =====================================================================================================
 * Implements:
 * 1. Express + Multer (memoryStorage) + Sharp image validation & preprocessing pipeline
 * 2. Real Cloudflare Workers AI Integration (@cf/black-forest-labs/flux-2-klein-4b)
 *    - Supports Text-to-Image and Multi-Reference Image-to-Image Editing (input_image_0..3)
 *    - Enforces < 512x512 reference image dimension constraints while preserving aspect ratio
 *    - Uses native FormData + Blob multipart/form-data requests
 *    - Inspects returned binary/Base64 image bytes to determine accurate MIME type & dimensions
 * 3. Complete Authentication & Password Reset Flows:
 *    - Email/Password Sign-In & Registration (2 Free Credits initialized once per eligible account)
 *    - Google OAuth callback & session verification
 *    - Forgot Password request with rate-limiting cooldown + Reset Password token update
 * 4. Transaction-Safe Credit System:
 *    - Reserve credit -> Execute AI -> Persist output -> Mark completed
 *    - Automatic, idempotent single-credit refund if provider or persistence fails
 * 5. Private Asset Storage & Authenticated Generation History
 * =====================================================================================================
 */

require("dotenv").config();
const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const PORT = Number(process.env.PORT) || 3000;
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const ASSETS_CACHE_DIR = path.join(DATA_DIR, "generated-assets");
const DB_FILE = path.join(DATA_DIR, "vidsynth-db.json");
const INITIAL_CREDITS = 2;

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://bypicewulwgbxypthdpf.supabase.co").trim();
const SUPABASE_ANON_KEY = (
  process.env.SUPABASE_ANON_KEY || "sb_publishable_tynIxLMhw_kQJU1-9MsRMw_F07kmcfK"
).trim();
const SUPABASE_SECRET_KEY = (process.env.SUPABASE_SECRET_KEY || "").trim();

const CLOUDFLARE_ACCOUNT_ID = (process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
const CLOUDFLARE_API_TOKEN = (process.env.CLOUDFLARE_API_TOKEN || "").trim();
const CLOUDFLARE_IMAGE_MODEL = (
  process.env.CLOUDFLARE_IMAGE_MODEL || "@cf/black-forest-labs/flux-2-klein-4b"
).trim();

const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SECRET_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
      })
    : null;

const supabasePublic =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
      })
    : null;

// Ensure local persistence directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(ASSETS_CACHE_DIR)) {
  fs.mkdirSync(ASSETS_CACHE_DIR, { recursive: true });
}

function loadMirrorDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
      return {
        profiles: parsed.profiles && typeof parsed.profiles === "object" ? parsed.profiles : {},
        generations: Array.isArray(parsed.generations) ? parsed.generations : [],
        creditTransactions: Array.isArray(parsed.creditTransactions) ? parsed.creditTransactions : [],
        developerApiRequests: Array.isArray(parsed.developerApiRequests) ? parsed.developerApiRequests : [],
        earlyAccessSubmissions: Array.isArray(parsed.earlyAccessSubmissions) ? parsed.earlyAccessSubmissions : []
      };
    }
  } catch (_) {}
  return {
    profiles: {},
    generations: [],
    creditTransactions: [],
    developerApiRequests: [],
    earlyAccessSubmissions: []
  };
}

function saveMirrorDb(state) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (_) {}
}

const mirrorDb = loadMirrorDb();
const activeGenerationUsers = new Set();
const processedRequestIds = new Map();
const refundedGenerationIds = new Set();
const passwordResetCooldowns = new Map();
const apiRateLimits = new Map();

// Ensure storage buckets exist on startup
async function ensureStorageBuckets() {
  if (!supabaseAdmin) return;
  const specs = [
    {
      id: "avatars",
      public: true,
      fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"]
    },
    {
      id: "generation-inputs",
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"]
    },
    {
      id: "generation-outputs",
      public: false,
      fileSizeLimit: 25 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"]
    }
  ];
  for (const spec of specs) {
    try {
      await supabaseAdmin.storage.createBucket(spec.id, {
        public: spec.public,
        fileSizeLimit: spec.fileSizeLimit,
        allowedMimeTypes: spec.allowedMimeTypes
      });
    } catch (_) {}
  }
}
ensureStorageBuckets();

// ----------------------------------------------------------------------------
// Image Validation, Binary Magic-Byte Inspection & <512x512 Reference Prep
// ----------------------------------------------------------------------------
function detectImageMimeAndExt(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { mimeType: "image/png", ext: "png" };
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: "image/jpeg", ext: "jpg" };
  }
  // WebP: RIFF....WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { mimeType: "image/webp", ext: "webp" };
  }
  return null;
}

/**
 * Validates and prepares a reference image for @cf/black-forest-labs/flux-2-klein-4b.
 * Official model constraint: Reference images (input_image_0..3) must be < 512x512 pixels.
 */
async function prepareReferenceImageBuffer(rawBuffer, originalName = "reference.jpg") {
  if (!Buffer.isBuffer(rawBuffer) || rawBuffer.length === 0) {
    const err = new Error("Uploaded reference image is empty.");
    err.code = "EMPTY_IMAGE";
    err.status = 400;
    throw err;
  }

  if (rawBuffer.length > 10 * 1024 * 1024) {
    const err = new Error("Reference image exceeds the 10 MB maximum file size.");
    err.code = "IMAGE_TOO_LARGE";
    err.status = 400;
    throw err;
  }

  const detected = detectImageMimeAndExt(rawBuffer);
  if (!detected) {
    const err = new Error(
      "Unsupported image format. Please upload a valid JPG, PNG, or WebP image."
    );
    err.code = "UNSUPPORTED_IMAGE_FORMAT";
    err.status = 400;
    throw err;
  }

  let metadata;
  try {
    metadata = await sharp(rawBuffer).metadata();
  } catch (_) {
    const err = new Error("Could not decode the uploaded image file. The file may be corrupted.");
    err.code = "INVALID_IMAGE_CONTENT";
    err.status = 400;
    throw err;
  }

  if (!metadata || !metadata.width || !metadata.height) {
    const err = new Error("Unable to read image dimensions from the uploaded file.");
    err.code = "INVALID_IMAGE_DIMENSIONS";
    err.status = 400;
    throw err;
  }

  // Documented FLUX.2 klein 4B constraint: reference images must be strictly < 512x512.
  // We resize inside a 480x480 box while preserving aspect ratio and visual fidelity.
  const MAX_REF_DIM = 480;
  let pipeline = sharp(rawBuffer).rotate(); // auto-orient EXIF

  if (metadata.width > MAX_REF_DIM || metadata.height > MAX_REF_DIM) {
    pipeline = pipeline.resize(MAX_REF_DIM, MAX_REF_DIM, {
      fit: "inside",
      withoutEnlargement: true
    });
  }

  const preparedBuffer = await pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  const preparedMeta = await sharp(preparedBuffer).metadata();

  return {
    buffer: preparedBuffer,
    originalBuffer: rawBuffer,
    originalMimeType: detected.mimeType,
    originalExt: detected.ext,
    mimeType: "image/jpeg",
    ext: "jpg",
    originalWidth: metadata.width,
    originalHeight: metadata.height,
    width: preparedMeta.width || MAX_REF_DIM,
    height: preparedMeta.height || MAX_REF_DIM,
    size: preparedBuffer.length,
    originalName: String(originalName || "reference.jpg").replace(/[^a-zA-Z0-9._-]/g, "_")
  };
}

function normalizeDimensions(aspectRatio, requestedWidth, requestedHeight) {
  const ratioPresets = {
    "1:1": { width: 1024, height: 1024 },
    "16:9": { width: 1024, height: 576 },
    "9:16": { width: 576, height: 1024 },
    "4:3": { width: 1024, height: 768 },
    "3:4": { width: 768, height: 1024 }
  };

  let w = Number(requestedWidth);
  let h = Number(requestedHeight);

  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 256 || h < 256) {
    const preset = ratioPresets[aspectRatio] || ratioPresets["1:1"];
    w = preset.width;
    h = preset.height;
  } else {
    // Clamp to [256, 1024] and round to nearest multiple of 16
    w = Math.max(256, Math.min(1024, Math.round(w / 16) * 16));
    h = Math.max(256, Math.min(1024, Math.round(h / 16) * 16));
  }

  return { width: w, height: h };
}

// ----------------------------------------------------------------------------
// Real AI Image Generation & Editing Engine (@cf/black-forest-labs/flux-2-klein-4b)
// ----------------------------------------------------------------------------
const generationEngine = {
  isConfigured() {
    return Boolean(
      CLOUDFLARE_ACCOUNT_ID &&
        CLOUDFLARE_API_TOKEN &&
        !CLOUDFLARE_ACCOUNT_ID.includes("your_") &&
        !CLOUDFLARE_API_TOKEN.includes("your_")
    );
  },

  async generate({
    prompt,
    description = "",
    stylePreset = "",
    aspectRatio = "1:1",
    width = null,
    height = null,
    guidance = 3.5,
    seed = null,
    referenceImages = []
  }) {
    if (!this.isConfigured()) {
      const err = new Error(
        "The image generation service is not configured on this server. Your credits were not deducted."
      );
      err.code = "ENGINE_NOT_CONFIGURED";
      err.status = 503;
      throw err;
    }

    const cleanPrompt = String(prompt || "").trim();
    if (!cleanPrompt) {
      const err = new Error("A prompt is required to generate or edit an image.");
      err.code = "MISSING_PROMPT";
      err.status = 400;
      throw err;
    }

    const { width: targetWidth, height: targetHeight } = normalizeDimensions(
      aspectRatio,
      width,
      height
    );

    const parsedGuidance = Number(guidance);
    const validGuidance =
      Number.isFinite(parsedGuidance) && parsedGuidance >= 1 && parsedGuidance <= 10
        ? Number(parsedGuidance.toFixed(2))
        : 3.5;

    const validSeed =
      seed !== null && seed !== undefined && seed !== "" && Number.isFinite(Number(seed))
        ? Math.max(0, Math.floor(Number(seed)))
        : null;

    const composedPrompt = [
      cleanPrompt,
      description ? `Additional details: ${String(description).trim()}` : "",
      stylePreset ? `Style direction: ${String(stylePreset).trim()}` : ""
    ]
      .filter(Boolean)
      .join(". ");

    // Construct multipart/form-data required by @cf/black-forest-labs/flux-2-klein-4b
    const form = new FormData();
    form.append("prompt", composedPrompt);
    form.append("width", String(targetWidth));
    form.append("height", String(targetHeight));
    form.append("guidance", String(validGuidance));
    if (validSeed !== null) {
      form.append("seed", String(validSeed));
    }

    const preparedRefs = [];
    const maxRefs = Math.min(Array.isArray(referenceImages) ? referenceImages.length : 0, 4);
    for (let i = 0; i < maxRefs; i++) {
      const refItem = referenceImages[i];
      if (!refItem || !refItem.buffer) continue;
      const prepared = await prepareReferenceImageBuffer(
        refItem.buffer,
        refItem.originalName || `input_image_${i}.jpg`
      );
      preparedRefs.push(prepared);
      const blob = new Blob([prepared.buffer], { type: prepared.mimeType });
      form.append(`input_image_${i}`, blob, `input_image_${i}.${prepared.ext}`);
    }

    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/${CLOUDFLARE_IMAGE_MODEL}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`
        },
        body: form,
        signal: controller.signal
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr && fetchErr.name === "AbortError") {
        const err = new Error("The AI generation request timed out. Your credit has been refunded.");
        err.code = "PROVIDER_TIMEOUT";
        err.status = 504;
        throw err;
      }
      const err = new Error("Unable to reach the AI generation engine. Your credit has been refunded.");
      err.code = "PROVIDER_UNAVAILABLE";
      err.status = 502;
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.status === 429) {
      const err = new Error(
        "The AI generation engine is currently experiencing high demand (rate limit reached). Your credit has been refunded."
      );
      err.code = "RATE_LIMITED";
      err.status = 429;
      throw err;
    }

    if (response.status === 401 || response.status === 403) {
      const err = new Error(
        "The server's AI provider credentials could not be authenticated. Your credit has been refunded."
      );
      err.code = "PROVIDER_AUTH_ERROR";
      err.status = 503;
      throw err;
    }

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    let outputBuffer = null;

    if (contentType.startsWith("image/")) {
      const arrayBuf = await response.arrayBuffer();
      outputBuffer = Buffer.from(arrayBuf);
    } else {
      const rawText = await response.text();
      let parsed = null;
      try {
        parsed = JSON.parse(rawText);
      } catch (_) {
        const err = new Error("Received a malformed response from the AI generation engine.");
        err.code = "INVALID_PROVIDER_RESPONSE";
        err.status = 502;
        throw err;
      }

      if (!response.ok || (parsed && parsed.success === false)) {
        const upstreamMsg =
          (parsed &&
            Array.isArray(parsed.errors) &&
            parsed.errors[0] &&
            parsed.errors[0].message) ||
          (parsed && parsed.error) ||
          "The AI model could not process this request.";
        const err = new Error(`Generation could not be completed: ${upstreamMsg}`);
        err.code = "MODEL_EXECUTION_ERROR";
        err.status = response.status >= 400 && response.status < 600 ? response.status : 502;
        throw err;
      }

      const base64Image =
        (parsed && parsed.result && parsed.result.image) ||
        (parsed && parsed.image) ||
        null;

      if (!base64Image || typeof base64Image !== "string") {
        const err = new Error("The AI generation engine did not return valid image data.");
        err.code = "MISSING_IMAGE_OUTPUT";
        err.status = 502;
        throw err;
      }

      const cleanedB64 = base64Image.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
      outputBuffer = Buffer.from(cleanedB64, "base64");
    }

    const outputFormat = detectImageMimeAndExt(outputBuffer);
    if (!outputFormat) {
      const err = new Error("Returned image data could not be verified as a valid image format.");
      err.code = "INVALID_IMAGE_OUTPUT";
      err.status = 502;
      throw err;
    }

    const outMeta = await sharp(outputBuffer).metadata().catch(() => ({}));

    return {
      buffer: outputBuffer,
      mimeType: outputFormat.mimeType,
      ext: outputFormat.ext,
      width: outMeta.width || targetWidth,
      height: outMeta.height || targetHeight,
      guidance: validGuidance,
      seed: validSeed,
      generationType: preparedRefs.length > 0 ? "image-to-image" : "text-to-image",
      preparedReferences: preparedRefs
    };
  }
};

// ----------------------------------------------------------------------------
// Authentication & Profile / Credit Persistence Layer
// ----------------------------------------------------------------------------
async function getAuthenticatedSupabaseUser(req) {
  const authHeader = req.headers.authorization || "";
  let token = "";
  if (authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  } else if (req.body && typeof req.body.accessToken === "string" && req.body.accessToken.trim()) {
    token = req.body.accessToken.trim();
  } else if (req.query && typeof req.query.token === "string") {
    token = req.query.token.trim();
  }
  if (!token) return null;

  const client = supabaseAdmin || supabasePublic;
  if (!client) return null;

  try {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data || !data.user) return null;
    return { user: data.user, token };
  } catch (_) {
    return null;
  }
}

function buildDefaultUsername(email, userId) {
  const prefix =
    String(email || "creator")
      .split("@")[0]
      .replace(/[^a-zA-Z0-9_]/g, "")
      .toLowerCase() || "creator";
  const suffix = String(userId || "").replace(/-/g, "").slice(0, 6) || "vs";
  return `${prefix}_${suffix}`;
}

async function getOrInitUserProfile(authUser) {
  const userId = authUser.id;
  const meta = authUser.user_metadata || {};

  // 1. Check PostgreSQL `public.profiles` table if available
  if (supabaseAdmin) {
    const { data: pgProfile, error: pgErr } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (!pgErr && pgProfile) {
      mirrorDb.profiles[userId] = {
        ...pgProfile,
        email: pgProfile.email || authUser.email,
        is_verified: Boolean(authUser.email_confirmed_at || pgProfile.is_verified)
      };
      saveMirrorDb(mirrorDb);
      return {
        ...mirrorDb.profiles[userId],
        remainingCredits: pgProfile.credits,
        maxCredits: INITIAL_CREDITS
      };
    }

    if (!pgErr && !pgProfile) {
      const existingMirror = mirrorDb.profiles[userId];
      const initialCredits =
        existingMirror && typeof existingMirror.credits === "number"
          ? existingMirror.credits
          : typeof meta.vidsynth_credits === "number"
          ? meta.vidsynth_credits
          : INITIAL_CREDITS;

      const newRow = {
        id: userId,
        full_name: meta.full_name || meta.name || String(authUser.email || "").split("@")[0],
        username: meta.username || buildDefaultUsername(authUser.email, userId),
        email: authUser.email,
        avatar_url: meta.avatar_url || "",
        bio: meta.bio || "",
        country: meta.country || "",
        website: meta.website || "",
        credits: initialCredits,
        total_generations:
          typeof meta.vidsynth_total_generations === "number"
            ? meta.vidsynth_total_generations
            : 0,
        is_verified: Boolean(authUser.email_confirmed_at)
      };

      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("profiles")
        .insert(newRow)
        .select("*")
        .single();

      if (!insErr && inserted) {
        await supabaseAdmin.from("credit_transactions").insert({
          user_id: userId,
          amount: INITIAL_CREDITS,
          transaction_type: "initial_grant",
          description: "Initial 2 Free Credits Signup Bonus"
        });
        mirrorDb.profiles[userId] = inserted;
        saveMirrorDb(mirrorDb);
        return {
          ...inserted,
          remainingCredits: inserted.credits,
          maxCredits: INITIAL_CREDITS
        };
      }
    }
  }

  // 2. Synchronized fallback using user_metadata + local mirror
  let profile = mirrorDb.profiles[userId];
  const hasBonusGranted =
    Boolean(meta.vidsynth_bonus_initialized) ||
    Boolean(profile) ||
    mirrorDb.creditTransactions.some(
      (t) => t.user_id === userId && t.transaction_type === "initial_grant"
    );

  if (!profile) {
    const initialCredits =
      typeof meta.vidsynth_credits === "number"
        ? meta.vidsynth_credits
        : hasBonusGranted
        ? 0
        : INITIAL_CREDITS;

    profile = {
      id: userId,
      full_name: meta.full_name || meta.name || String(authUser.email || "").split("@")[0],
      username: meta.username || buildDefaultUsername(authUser.email, userId),
      email: authUser.email,
      avatar_url: meta.avatar_url || meta.picture || "",
      bio: meta.bio || "",
      country: meta.country || "",
      website: meta.website || "",
      credits: initialCredits,
      total_generations:
        typeof meta.vidsynth_total_generations === "number" ? meta.vidsynth_total_generations : 0,
      is_verified: Boolean(authUser.email_confirmed_at),
      privacy_settings: meta.privacy_settings || {
        profile_visibility: "private",
        history_visibility: "private",
        default_asset_visibility: "private",
        data_privacy_opt_out: true
      },
      notification_settings: meta.notification_settings || {
        email_notifications: true,
        generation_completion: true,
        product_announcements: false
      },
      created_at: authUser.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    mirrorDb.profiles[userId] = profile;

    if (!mirrorDb.creditTransactions.some((t) => t.user_id === userId && t.transaction_type === "initial_grant")) {
      mirrorDb.creditTransactions.unshift({
        id: crypto.randomUUID(),
        user_id: userId,
        amount: INITIAL_CREDITS,
        transaction_type: "initial_grant",
        description: "Initial 2 Free Credits Signup Bonus",
        generation_id: null,
        created_at: new Date().toISOString()
      });
    }
    saveMirrorDb(mirrorDb);

    if (supabaseAdmin && !meta.vidsynth_bonus_initialized) {
      try {
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          user_metadata: {
            ...meta,
            vidsynth_credits: profile.credits,
            vidsynth_total_generations: profile.total_generations,
            vidsynth_bonus_initialized: true
          }
        });
      } catch (_) {}
    }
  } else {
    profile.email = authUser.email;
    profile.is_verified = Boolean(authUser.email_confirmed_at);
    if (!profile.avatar_url && (meta.avatar_url || meta.picture)) {
      profile.avatar_url = meta.avatar_url || meta.picture;
    }
  }

  return {
    ...profile,
    remainingCredits: profile.credits,
    maxCredits: INITIAL_CREDITS
  };
}

async function updateProfileData(authUser, updates) {
  const userId = authUser.id;
  const current = await getOrInitUserProfile(authUser);

  if (updates.username && updates.username !== current.username) {
    const cleanUsername = String(updates.username).trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(cleanUsername)) {
      throw new Error(
        "Username must be 3–30 characters using lowercase letters, numbers, or underscores."
      );
    }
    if (supabaseAdmin) {
      const { data: existingUser } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("username", cleanUsername)
        .neq("id", userId)
        .maybeSingle();
      if (existingUser) {
        throw new Error("That username is already taken. Please choose another.");
      }
    }
    const mirrorConflict = Object.values(mirrorDb.profiles).find(
      (p) => p.id !== userId && p.username === cleanUsername
    );
    if (mirrorConflict) {
      throw new Error("That username is already taken. Please choose another.");
    }
    updates.username = cleanUsername;
  }

  // Strictly forbid client-side credit or total_generations manipulation
  delete updates.credits;
  delete updates.total_generations;
  delete updates.is_verified;
  delete updates.id;

  const nextProfile = {
    ...current,
    ...updates,
    updated_at: new Date().toISOString()
  };

  if (supabaseAdmin) {
    const { data: pgUpdated, error: pgErr } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: nextProfile.full_name,
        username: nextProfile.username,
        avatar_url: nextProfile.avatar_url,
        bio: nextProfile.bio,
        country: nextProfile.country,
        website: nextProfile.website,
        privacy_settings: nextProfile.privacy_settings,
        notification_settings: nextProfile.notification_settings,
        updated_at: nextProfile.updated_at
      })
      .eq("id", userId)
      .select("*")
      .maybeSingle();

    if (!pgErr && pgUpdated) {
      mirrorDb.profiles[userId] = { ...nextProfile, ...pgUpdated };
    } else {
      mirrorDb.profiles[userId] = nextProfile;
    }
    saveMirrorDb(mirrorDb);

    try {
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...(authUser.user_metadata || {}),
          full_name: nextProfile.full_name,
          username: nextProfile.username,
          avatar_url: nextProfile.avatar_url,
          bio: nextProfile.bio,
          country: nextProfile.country,
          website: nextProfile.website,
          privacy_settings: nextProfile.privacy_settings,
          notification_settings: nextProfile.notification_settings,
          vidsynth_credits: nextProfile.credits,
          vidsynth_total_generations: nextProfile.total_generations,
          vidsynth_bonus_initialized: true
        }
      });
    } catch (_) {}
  } else {
    mirrorDb.profiles[userId] = nextProfile;
    saveMirrorDb(mirrorDb);
  }

  return {
    ...nextProfile,
    remainingCredits: nextProfile.credits,
    maxCredits: INITIAL_CREDITS
  };
}

/**
 * Atomically reserves/deducts 1 credit BEFORE calling the AI generation provider.
 * Returns { remainingCredits, transactionId }.
 */
async function reserveGenerationCredit(authUser, generationId, description) {
  const userId = authUser.id;
  const profile = await getOrInitUserProfile(authUser);

  if (profile.credits < 1) {
    const err = new Error(
      "You have 0 remaining credits. Please request an additional credit allocation to continue generating."
    );
    err.code = "INSUFFICIENT_CREDITS";
    err.status = 403;
    throw err;
  }

  const transactionId = crypto.randomUUID();

  // 1. Try PostgreSQL RPC function `consume_generation_credit` if available
  if (supabaseAdmin) {
    const { data: rpcCredits, error: rpcErr } = await supabaseAdmin.rpc(
      "consume_generation_credit",
      {
        p_user_id: userId,
        p_generation_id: generationId,
        p_description: description
      }
    );
    if (!rpcErr && typeof rpcCredits === "number") {
      if (!mirrorDb.profiles[userId]) mirrorDb.profiles[userId] = profile;
      mirrorDb.profiles[userId].credits = rpcCredits;
      mirrorDb.profiles[userId].total_generations =
        (mirrorDb.profiles[userId].total_generations || 0) + 1;
      saveMirrorDb(mirrorDb);
      return { remainingCredits: rpcCredits, transactionId };
    }
  }

  // 2. Atomic fallback in mirror + user_metadata
  const nextCredits = Math.max(0, profile.credits - 1);
  const nextTotalGen = (profile.total_generations || 0) + 1;

  if (!mirrorDb.profiles[userId]) {
    mirrorDb.profiles[userId] = profile;
  }
  mirrorDb.profiles[userId].credits = nextCredits;
  mirrorDb.profiles[userId].total_generations = nextTotalGen;
  mirrorDb.profiles[userId].updated_at = new Date().toISOString();

  mirrorDb.creditTransactions.unshift({
    id: transactionId,
    user_id: userId,
    amount: -1,
    transaction_type: "generation_usage",
    description,
    generation_id: generationId,
    created_at: new Date().toISOString()
  });
  saveMirrorDb(mirrorDb);

  if (supabaseAdmin) {
    try {
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...(authUser.user_metadata || {}),
          vidsynth_credits: nextCredits,
          vidsynth_total_generations: nextTotalGen,
          vidsynth_bonus_initialized: true
        }
      });
    } catch (_) {}
  }

  return { remainingCredits: nextCredits, transactionId };
}

/**
 * Refunds a reserved credit EXACTLY ONCE if generation or persistence fails.
 */
async function refundReservedCreditOnce(authUser, generationId, reason) {
  const userId = authUser.id;
  if (!generationId || refundedGenerationIds.has(generationId)) {
    const current = await getOrInitUserProfile(authUser);
    return current.credits;
  }

  // Also check if already refunded in mirrorDb
  const alreadyInLedger = mirrorDb.creditTransactions.some(
    (t) => t.user_id === userId && t.generation_id === generationId && t.transaction_type === "refund"
  );
  if (alreadyInLedger) {
    refundedGenerationIds.add(generationId);
    const current = await getOrInitUserProfile(authUser);
    return current.credits;
  }

  refundedGenerationIds.add(generationId);

  if (supabaseAdmin) {
    const { data: rpcCredits, error: rpcErr } = await supabaseAdmin.rpc(
      "refund_generation_credit",
      {
        p_user_id: userId,
        p_generation_id: generationId,
        p_reason: reason || "Generation failed — automatic credit refund"
      }
    );
    if (!rpcErr && typeof rpcCredits === "number") {
      if (mirrorDb.profiles[userId]) {
        mirrorDb.profiles[userId].credits = rpcCredits;
        mirrorDb.profiles[userId].total_generations = Math.max(
          0,
          (mirrorDb.profiles[userId].total_generations || 1) - 1
        );
        saveMirrorDb(mirrorDb);
      }
      return rpcCredits;
    }
  }

  const profile = await getOrInitUserProfile(authUser);
  const nextCredits = Math.min(INITIAL_CREDITS, profile.credits + 1);
  const nextTotalGen = Math.max(0, (profile.total_generations || 1) - 1);

  if (!mirrorDb.profiles[userId]) {
    mirrorDb.profiles[userId] = profile;
  }
  mirrorDb.profiles[userId].credits = nextCredits;
  mirrorDb.profiles[userId].total_generations = nextTotalGen;
  mirrorDb.profiles[userId].updated_at = new Date().toISOString();

  mirrorDb.creditTransactions.unshift({
    id: crypto.randomUUID(),
    user_id: userId,
    amount: 1,
    transaction_type: "refund",
    description: reason || "Automatic refund for failed generation",
    generation_id: generationId,
    created_at: new Date().toISOString()
  });
  saveMirrorDb(mirrorDb);

  if (supabaseAdmin) {
    try {
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...(authUser.user_metadata || {}),
          vidsynth_credits: nextCredits,
          vidsynth_total_generations: nextTotalGen,
          vidsynth_bonus_initialized: true
        }
      });
    } catch (_) {}
  }

  return nextCredits;
}

async function listUserGenerations(userId) {
  let records = [];
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from("generations")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (!error && Array.isArray(data) && data.length > 0) {
      records = data;
    }
  }
  if (records.length === 0) {
    records = mirrorDb.generations
      .filter((g) => g.user_id === userId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  // Refresh signed URLs for private storage paths
  if (supabaseAdmin) {
    for (const item of records) {
      if (item.input_storage_path) {
        try {
          const { data } = await supabaseAdmin.storage
            .from("generation-inputs")
            .createSignedUrl(item.input_storage_path, 3600);
          if (data && data.signedUrl) item.input_image_url = data.signedUrl;
        } catch (_) {}
      }
      if (item.output_storage_path) {
        try {
          const { data } = await supabaseAdmin.storage
            .from("generation-outputs")
            .createSignedUrl(item.output_storage_path, 3600);
          if (data && data.signedUrl) item.output_image_url = data.signedUrl;
        } catch (_) {}
      }
    }
  }
  return records;
}

async function saveGenerationRecord(record) {
  if (supabaseAdmin) {
    try {
      await supabaseAdmin.from("generations").upsert({
        id: record.id,
        user_id: record.user_id,
        request_id: record.request_id,
        title: record.title,
        description: record.description,
        prompt: record.prompt,
        negative_prompt: record.negative_prompt || "",
        generation_type: record.generation_type || "image",
        style_preset: record.style_preset || "",
        aspect_ratio: record.aspect_ratio || "1:1",
        processing_mode: record.processing_mode || "VS-CHAR-2.4",
        input_image_url: record.input_image_url || "",
        output_image_url: record.output_image_url || "",
        output_video_url: record.output_video_url || "",
        status: record.status,
        error_message: record.error_message || "",
        created_at: record.created_at,
        completed_at: record.completed_at || null
      });
    } catch (_) {}
  }

  const idx = mirrorDb.generations.findIndex((g) => g.id === record.id);
  if (idx >= 0) {
    mirrorDb.generations[idx] = record;
  } else {
    mirrorDb.generations.unshift(record);
  }
  saveMirrorDb(mirrorDb);
  return record;
}

async function listUserCreditTransactions(userId) {
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from("credit_transactions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (!error && Array.isArray(data) && data.length > 0) {
      return data;
    }
  }
  return mirrorDb.creditTransactions.filter((t) => t.user_id === userId);
}

// ----------------------------------------------------------------------------
// Showcase Pair Discovery
// ----------------------------------------------------------------------------
function discoverShowcasePairs() {
  const beforeDir = path.join(ROOT_DIR, "assets", "showcase", "before");
  const afterDir = path.join(ROOT_DIR, "assets", "showcase", "after");
  const validExts = new Set([".jpg", ".jpeg", ".png", ".webp"]);
  const beforeMap = new Map();
  const afterMap = new Map();

  if (fs.existsSync(beforeDir)) {
    for (const file of fs.readdirSync(beforeDir)) {
      const ext = path.extname(file).toLowerCase();
      const base = path.basename(file, path.extname(file));
      if (!validExts.has(ext)) continue;
      const m = base.match(/^before(\d+)$/i);
      if (m) beforeMap.set(Number(m[1]), file);
    }
  }
  if (fs.existsSync(afterDir)) {
    for (const file of fs.readdirSync(afterDir)) {
      const ext = path.extname(file).toLowerCase();
      const base = path.basename(file, path.extname(file));
      if (!validExts.has(ext)) continue;
      const m = base.match(/^after(\d+)$/i);
      if (m) afterMap.set(Number(m[1]), file);
    }
  }

  return [...beforeMap.keys()]
    .filter((id) => afterMap.has(id))
    .sort((a, b) => a - b)
    .map((id) => ({
      id,
      beforeFile: beforeMap.get(id),
      afterFile: afterMap.get(id),
      beforeUrl: `assets/showcase/before/${beforeMap.get(id)}`,
      afterUrl: `assets/showcase/after/${afterMap.get(id)}`
    }));
}

function discoverVideoPairs() {
  return [
    {
      id: "pair-01",
      code: "PAIR 01 — HUMAN TO ANIME",
      beforeUrl: "assets/showcase/videos/vidio%20before1.mp4",
      afterUrl: "assets/showcase/videos/vidio%20after1.mp4",
      beforePoster: "assets/showcase/videos/human-to-anime-before-poster.jpg",
      afterPoster: "assets/showcase/videos/human-to-anime-after-poster.jpg"
    },
    {
      id: "pair-02",
      code: "PAIR 02 — LION TO ROBOT",
      beforeUrl: "assets/showcase/videos/vidio%20before2.mp4",
      afterUrl: "assets/showcase/videos/vidio%20after2.mp4",
      beforePoster: "assets/showcase/videos/lion-to-robot-before-poster.jpg",
      afterPoster: "assets/showcase/videos/lion-to-robot-after-poster.jpg"
    }
  ];
}

// ----------------------------------------------------------------------------
// Express Application Setup & Security Middleware
// ----------------------------------------------------------------------------
const app = express();
app.disable("x-powered-by");

// Multer configuration for multipart/form-data image uploads (up to 4 reference images, max 10MB each)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 4
  }
});

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// Block sensitive server files before static middleware
app.use((req, res, next) => {
  let decoded = req.path;
  try {
    decoded = decodeURIComponent(req.path);
  } catch (_) {}
  const lower = decoded.toLowerCase();
  if (
    lower.includes(".env") ||
    lower.startsWith("/data") ||
    lower.startsWith("/supabase") ||
    lower === "/server.js" ||
    lower === "/package.json" ||
    lower === "/package-lock.json"
  ) {
    return res.status(403).type("text/plain").send("403 Forbidden");
  }
  next();
});

// Simple rate limiter helper
function checkRateLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  const entry = apiRateLimits.get(key);
  if (!entry || now > entry.resetAt) {
    apiRateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
    };
  }
  entry.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

// ----------------------------------------------------------------------------
// 1. Health & Public Runtime Status Endpoints
// ----------------------------------------------------------------------------
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    status: "ok",
    appName: "VidSynth AI",
    engineReady: generationEngine.isConfigured()
  });
});

app.get("/api/config/public", async (_req, res) => {
  let sqlSchemaReady = false;
  if (supabaseAdmin) {
    const { error } = await supabaseAdmin.from("profiles").select("id").limit(1);
    sqlSchemaReady = !error;
  }
  res.json({
    appName: "VidSynth AI",
    brandUpper: "VIDSYNTH AI",
    pipelineName: "VidSynth AI Generation Pipeline",
    workflowName: "VidSynth AI Creative Workflow",
    processingName: "VidSynth AI Visual Processing",
    supabaseConfigured: Boolean(SUPABASE_URL && SUPABASE_ANON_KEY),
    sqlSchemaReady,
    pipelineReady: generationEngine.isConfigured(),
    defaultCredits: INITIAL_CREDITS
  });
});

app.get("/api/showcase/pairs", (_req, res) => {
  const pairs = discoverShowcasePairs();
  const videoPairs = discoverVideoPairs();
  res.json({
    count: pairs.length,
    videoCount: videoPairs.length,
    pairs,
    videoPairs
  });
});

// ----------------------------------------------------------------------------
// 2. Authentication Endpoints (Register, Login, Forgot Password, Reset Password)
// ----------------------------------------------------------------------------
app.post("/api/auth/register", async (req, res) => {
  try {
    const body = req.body || {};
    const fullName = String(body.fullName || body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const confirmPassword =
      body.confirmPassword !== undefined ? String(body.confirmPassword) : password;
    const termsAccepted = body.termsAccepted !== undefined ? Boolean(body.termsAccepted) : true;

    if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
      return res.status(400).json({
        code: "INVALID_EMAIL",
        message: "Please enter a valid email address."
      });
    }
    if (password.length < 8) {
      return res.status(400).json({
        code: "WEAK_PASSWORD",
        message: "Password must be at least 8 characters long."
      });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({
        code: "PASSWORD_MISMATCH",
        message: "Passwords do not match. Please confirm your password."
      });
    }
    if (!termsAccepted) {
      return res.status(400).json({
        code: "TERMS_REQUIRED",
        message: "Please accept the Terms of Service and Privacy Policy to create an account."
      });
    }

    if (!supabasePublic) {
      return res.status(503).json({
        code: "AUTH_UNAVAILABLE",
        message: "Authentication service is temporarily unavailable."
      });
    }

    const displayFullName = fullName.length >= 2 ? fullName : email.split("@")[0];
    const origin =
      req.headers.origin ||
      `${req.protocol}://${req.get("host") || `localhost:${PORT}`}`;

    let createdUser = null;
    let session = null;

    if (supabaseAdmin) {
      const { data: adminCreated, error: adminErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: displayFullName,
          vidsynth_credits: INITIAL_CREDITS,
          vidsynth_total_generations: 0,
          vidsynth_bonus_initialized: true
        }
      });

      if (adminErr) {
        const msgLower = String(adminErr.message || "").toLowerCase();
        if (
          msgLower.includes("already registered") ||
          msgLower.includes("already exists") ||
          msgLower.includes("already been registered") ||
          msgLower.includes("duplicate")
        ) {
          return res.status(409).json({
            code: "EMAIL_ALREADY_EXISTS",
            message: "An account with this email already exists. Please sign in or reset your password."
          });
        }
        return res.status(400).json({
          code: "REGISTRATION_FAILED",
          message: "Could not complete registration. Please check your details and try again."
        });
      }

      createdUser = adminCreated.user;
      const { data: signInData } = await supabasePublic.auth.signInWithPassword({
        email,
        password
      });
      if (signInData && signInData.session) {
        session = signInData.session;
        createdUser = signInData.user || createdUser;
      }
    } else {
      const { data, error } = await supabasePublic.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${origin}/?auth_action=email_verified`,
          data: {
            full_name: displayFullName,
            vidsynth_credits: INITIAL_CREDITS,
            vidsynth_total_generations: 0,
            vidsynth_bonus_initialized: true
          }
        }
      });

      if (error) {
        const msgLower = String(error.message || "").toLowerCase();
        if (msgLower.includes("already registered") || msgLower.includes("already exists")) {
          return res.status(409).json({
            code: "EMAIL_ALREADY_EXISTS",
            message: "An account with this email already exists. Please sign in or reset your password."
          });
        }
        return res.status(400).json({
          code: "REGISTRATION_FAILED",
          message: "Could not complete registration. Please check your details and try again."
        });
      }

      if (
        data &&
        data.user &&
        Array.isArray(data.user.identities) &&
        data.user.identities.length === 0
      ) {
        return res.status(409).json({
          code: "EMAIL_ALREADY_EXISTS",
          message: "An account with this email already exists. Please sign in or reset your password."
        });
      }

      createdUser = data.user;
      session = data.session;
    }

    const requiresEmailConfirmation = Boolean(createdUser && !session);

    let profile = null;
    if (createdUser) {
      profile = await getOrInitUserProfile(createdUser);
    }

    return res.status(201).json({
      ok: true,
      authenticated: Boolean(session),
      requiresEmailConfirmation,
      token: session ? session.access_token : null,
      session,
      user: profile
        ? {
            ...profile,
            name: profile.full_name,
            remainingCredits: profile.credits,
            maxCredits: INITIAL_CREDITS
          }
        : null,
      message: requiresEmailConfirmation
        ? "Account created! Please check your email inbox to verify your address before signing in."
        : "Welcome to VidSynth AI! Your 2 free credits are ready."
    });
  } catch (_) {
    return res.status(400).json({
      code: "REGISTRATION_ERROR",
      message: "Unable to process registration right now. Please try again."
    });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const body = req.body || {};
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!email || !password) {
      return res.status(400).json({
        code: "MISSING_CREDENTIALS",
        message: "Please enter both your email address and password."
      });
    }

    if (!supabasePublic) {
      return res.status(503).json({
        code: "AUTH_UNAVAILABLE",
        message: "Authentication service is temporarily unavailable."
      });
    }

    const { data, error } = await supabasePublic.auth.signInWithPassword({
      email,
      password
    });

    if (error || !data.user || !data.session) {
      const errLower = String((error && error.message) || "").toLowerCase();
      if (errLower.includes("email not confirmed")) {
        return res.status(403).json({
          code: "EMAIL_NOT_VERIFIED",
          message: "Please verify your email address using the link sent to your inbox before signing in."
        });
      }
      return res.status(401).json({
        code: "INVALID_CREDENTIALS",
        message: "Invalid email address or password."
      });
    }

    const profile = await getOrInitUserProfile(data.user);

    return res.json({
      ok: true,
      authenticated: true,
      token: data.session.access_token,
      session: data.session,
      user: {
        ...profile,
        name: profile.full_name,
        remainingCredits: profile.credits,
        maxCredits: INITIAL_CREDITS
      }
    });
  } catch (_) {
    return res.status(400).json({
      code: "LOGIN_ERROR",
      message: "Could not sign in right now. Please try again."
    });
  }
});

app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const body = req.body || {};
    const email = String(body.email || "").trim().toLowerCase();

    if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
      return res.status(400).json({
        code: "INVALID_EMAIL",
        message: "Please enter a valid email address."
      });
    }

    // Cooldown rate limit (60 seconds per email)
    const now = Date.now();
    const lastSent = passwordResetCooldowns.get(email) || 0;
    const cooldownMs = 60 * 1000;
    if (now - lastSent < cooldownMs) {
      const retryAfterSeconds = Math.ceil((cooldownMs - (now - lastSent)) / 1000);
      return res.status(429).json({
        code: "COOLDOWN_ACTIVE",
        retryAfterSeconds,
        message: `Please wait ${retryAfterSeconds} seconds before requesting another password reset email.`
      });
    }

    if (!supabasePublic && !supabaseAdmin) {
      return res.status(503).json({
        code: "AUTH_UNAVAILABLE",
        message: "Password reset service is currently unavailable."
      });
    }

    const origin =
      String(body.redirectTo || body.redirectOrigin || "").trim() ||
      req.headers.origin ||
      `${req.protocol}://${req.get("host") || `localhost:${PORT}`}`;
    const redirectTo =
      origin.includes("/reset-password") ||
      origin.includes("reset-password.html") ||
      origin.includes("auth_action=")
        ? origin
        : `${origin.replace(/\/$/, "")}/reset-password`;

    const { error } = await supabasePublic.auth.resetPasswordForEmail(email, {
      redirectTo
    });

    if (error && supabaseAdmin) {
      // Fallback to admin recovery link generation if SMTP rate limit is active
      await supabaseAdmin.auth.admin
        .generateLink({
          type: "recovery",
          email,
          options: { redirectTo }
        })
        .catch(() => {});
    }

    passwordResetCooldowns.set(email, now);

    // Avoid exposing whether an arbitrary email belongs to an existing account
    return res.json({
      ok: true,
      accepted: true,
      cooldownSeconds: 60,
      message:
        "If an account exists for that email address, a secure password reset link has been sent. Please check your inbox and spam folder."
    });
  } catch (_) {
    return res.status(500).json({
      code: "RESET_REQUEST_FAILED",
      message: "Unable to process your password reset request right now."
    });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  const auth = await getAuthenticatedSupabaseUser(req);
  if (!auth || !auth.user) {
    return res.status(401).json({
      code: "INVALID_OR_EXPIRED_TOKEN",
      message:
        "Your password reset link has expired or is invalid. Please request a new password reset link."
    });
  }

  try {
    const body = req.body || {};
    const newPassword = String(body.password || body.newPassword || "");
    const confirmPassword =
      body.confirmPassword !== undefined ? String(body.confirmPassword) : newPassword;

    if (newPassword.length < 8) {
      return res.status(400).json({
        code: "WEAK_PASSWORD",
        message: "Your new password must be at least 8 characters long."
      });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        code: "PASSWORD_MISMATCH",
        message: "New password and confirmation do not match."
      });
    }

    if (!supabaseAdmin) {
      return res.status(503).json({
        code: "AUTH_UNAVAILABLE",
        message: "Password update service is currently unavailable."
      });
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(auth.user.id, {
      password: newPassword
    });

    if (error) {
      return res.status(400).json({
        code: "PASSWORD_UPDATE_FAILED",
        message: "Could not update your password. Please try a different password or request a new link."
      });
    }

    return res.json({
      ok: true,
      updated: true,
      message: "Your password has been updated. You can now sign in with your new password."
    });
  } catch (_) {
    return res.status(400).json({
      code: "PASSWORD_UPDATE_FAILED",
      message: "Unable to update your password right now."
    });
  }
});

app.post("/api/auth/verify-reset-token", async (req, res) => {
  const auth = await getAuthenticatedSupabaseUser(req);
  if (!auth || !auth.user) {
    return res.status(401).json({
      ok: false,
      valid: false,
      code: "INVALID_OR_EXPIRED_TOKEN",
      message: "Your password reset link has expired or is invalid."
    });
  }
  return res.json({
    ok: true,
    valid: true,
    email: auth.user.email || ""
  });
});

app.post("/api/auth/logout", (_req, res) => {
  res.json({ authenticated: false });
});

app.get("/api/auth/me", async (req, res) => {
  const auth = await getAuthenticatedSupabaseUser(req);
  if (!auth) {
    return res.json({ authenticated: false, user: null });
  }
  const profile = await getOrInitUserProfile(auth.user);
  return res.json({
    authenticated: true,
    user: {
      ...profile,
      name: profile.full_name,
      remainingCredits: profile.credits,
      maxCredits: INITIAL_CREDITS
    }
  });
});

app.get("/api/profile", async (req, res) => {
  const auth = await getAuthenticatedSupabaseUser(req);
  if (!auth) {
    return res.status(401).json({
      authenticated: false,
      user: null,
      code: "AUTH_REQUIRED",
      message: "Authentication is required to access your profile."
    });
  }
  const profile = await getOrInitUserProfile(auth.user);
  const transactions = await listUserCreditTransactions(auth.user.id);
  const generations = await listUserGenerations(auth.user.id);

  return res.json({
    authenticated: true,
    user: {
      ...profile,
      name: profile.full_name,
      remainingCredits: profile.credits,
      maxCredits: INITIAL_CREDITS
    },
    creditTransactions: transactions,
    recentGenerations: generations.slice(0, 8)
  });
});

// ----------------------------------------------------------------------------
// 3. Profile & Account Settings Endpoints
// ----------------------------------------------------------------------------
app.patch("/api/profile", async (req, res) => {
  const auth = await getAuthenticatedSupabaseUser(req);
  if (!auth) {
    return res.status(401).json({ code: "AUTH_REQUIRED", message: "Authentication required." });
  }
  try {
    const body = req.body || {};
    const allowedUpdates = {};
    if (typeof body.full_name === "string") allowedUpdates.full_name = body.full_name.trim().slice(0, 80);
    if (typeof body.username === "string") allowedUpdates.username = body.username.trim();
    if (typeof body.bio === "string") allowedUpdates.bio = body.bio.trim().slice(0, 300);
    if (typeof body.country === "string") allowedUpdates.country = body.country.trim().slice(0, 60);
    if (typeof body.website === "string") allowedUpdates.website = body.website.trim().slice(0, 140);
    if (body.privacy_settings && typeof body.privacy_settings === "object") {
      allowedUpdates.privacy_settings = {
        profile_visibility: body.privacy_settings.profile_visibility === "public" ? "public" : "private",
        history_visibility: body.privacy_settings.history_visibility === "public" ? "public" : "private",
        default_asset_visibility:
          body.privacy_settings.default_asset_visibility === "public" ? "public" : "private",
        data_privacy_opt_out: Boolean(body.privacy_settings.data_privacy_opt_out)
      };
    }
    if (body.notification_settings && typeof body.notification_settings === "object") {
      allowedUpdates.notification_settings = {
        email_notifications: Boolean(body.notification_settings.email_notifications),
        generation_completion: Boolean(body.notification_settings.generation_completion),
        product_announcements: Boolean(body.notification_settings.product_announcements)
      };
    }

    const updated = await updateProfileData(auth.user, allowedUpdates);
    return res.json({
      updated: true,
      user: {
        ...updated,
        name: updated.full_name,
        remainingCredits: updated.credits,
        maxCredits: INITIAL_CREDITS
      },
      message: "Profile settings saved to VidSynth AI."
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

app.post("/api/storage/avatar", async (req, res) => {
  const auth = await getAuthenticatedSupabaseUser(req);
  if (!auth) {
    return res.status(401).json({ code: "AUTH_REQUIRED", message: "Authentication required." });
  }
  try {
    const body = req.body || {};
    const base64Data = String(body.base64Data || "").replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ message: "Avatar image must be under 5 MB." });
    }

    const detected = detectImageMimeAndExt(buffer);
    if (!detected) {
      return res
        .status(400)
        .json({ message: "Unsupported avatar format. Please upload JPG, PNG, or WebP." });
    }

    if (!supabaseAdmin) {
      return res.status(503).json({ message: "Storage service is not configured." });
    }

    const currentProfile = await getOrInitUserProfile(auth.user);
    const objectPath = `${auth.user.id}/avatar_${Date.now()}.${detected.ext}`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from("avatars")
      .upload(objectPath, buffer, { contentType: detected.mimeType, upsert: true });

    if (uploadErr) {
      return res.status(400).json({ message: "Could not upload avatar image." });
    }

    if (currentProfile.avatar_storage_path && currentProfile.avatar_storage_path !== objectPath) {
      try {
        await supabaseAdmin.storage.from("avatars").remove([currentProfile.avatar_storage_path]);
      } catch (_) {}
    }

    const { data: pubData } = supabaseAdmin.storage.from("avatars").getPublicUrl(objectPath);
    const avatarUrl = pubData ? pubData.publicUrl : "";

    const updated = await updateProfileData(auth.user, {
      avatar_url: avatarUrl,
      avatar_storage_path: objectPath
    });

    return res.json({
      uploaded: true,
      avatarUrl,
      storagePath: objectPath,
      user: {
        ...updated,
        name: updated.full_name,
        remainingCredits: updated.credits,
        maxCredits: INITIAL_CREDITS
      },
      message: "Profile picture updated."
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

app.post("/api/storage/reference-image", async (req, res) => {
  const auth = await getAuthenticatedSupabaseUser(req);
  if (!auth) {
    return res
      .status(401)
      .json({ code: "AUTH_REQUIRED", message: "Please sign in to upload reference images." });
  }
  try {
    const body = req.body || {};
    const base64Data = String(body.base64Data || "").replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
    const rawBuffer = Buffer.from(base64Data, "base64");

    const prepared = await prepareReferenceImageBuffer(rawBuffer, body.fileName || "reference.jpg");
    const objectPath = `${auth.user.id}/ref_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${prepared.ext}`;

    if (!supabaseAdmin) {
      return res.status(503).json({ message: "Storage service is not configured." });
    }

    const { error: uploadErr } = await supabaseAdmin.storage
      .from("generation-inputs")
      .upload(objectPath, prepared.buffer, { contentType: prepared.mimeType, upsert: false });

    if (uploadErr) {
      return res.status(400).json({ message: "Could not store reference image." });
    }

    const { data: signedData } = await supabaseAdmin.storage
      .from("generation-inputs")
      .createSignedUrl(objectPath, 3600);

    return res.json({
      uploaded: true,
      storagePath: objectPath,
      signedUrl: signedData ? signedData.signedUrl : "",
      mimeType: prepared.mimeType,
      width: prepared.width,
      height: prepared.height,
      size: prepared.size
    });
  } catch (err) {
    return res.status(err.status || 400).json({
      code: err.code || "INVALID_REFERENCE_IMAGE",
      message: err.message
    });
  }
});

app.delete("/api/storage/reference-image", async (req, res) => {
  const auth = await getAuthenticatedSupabaseUser(req);
  if (!auth) {
    return res.status(401).json({ code: "AUTH_REQUIRED", message: "Authentication required." });
  }
  try {
    const body = req.body || {};
    const storagePath = String(body.storagePath || "");
    if (!storagePath.startsWith(`${auth.user.id}/`)) {
      return res.status(403).json({ message: "Forbidden: You can only delete your own files." });
    }
    if (supabaseAdmin) {
      await supabaseAdmin.storage.from("generation-inputs").remove([storagePath]);
    }
    return res.json({ deleted: true });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

// ----------------------------------------------------------------------------
// 4. POST /api/generate-or-edit & POST /api/studio/generate
//    Real AI Image Generation & Image-to-Image Editing with Atomic Credits
// ----------------------------------------------------------------------------
const handleGenerateOrEdit = async (req, res) => {
  const auth = await getAuthenticatedSupabaseUser(req);
  if (!auth || !auth.user) {
    return res.status(401).json({
      code: "AUTH_REQUIRED",
      error: "AUTH_REQUIRED",
      message: "Please sign in or create your VidSynth AI account to generate or edit images."
    });
  }

  const userId = auth.user.id;
  const body = req.body || {};
  const requestId =
    String(body.requestId || req.headers["x-vidsynth-request-id"] || "").trim() ||
    crypto.randomUUID();

  // 1. Idempotency check: prevent duplicate submissions from deducting credits twice
  if (processedRequestIds.has(requestId)) {
    return res.status(200).json(processedRequestIds.get(requestId));
  }

  // 2. Per-user rate limit & concurrency check
  if (activeGenerationUsers.has(userId)) {
    return res.status(429).json({
      code: "GENERATION_IN_PROGRESS",
      message:
        "A generation request is already running for your account. Please wait for it to finish."
    });
  }

  const rateCheck = checkRateLimit(`gen:${userId}`, 10, 60 * 1000);
  if (!rateCheck.allowed) {
    return res.status(429).json({
      code: "RATE_LIMITED",
      message: `Too many requests. Please wait ${rateCheck.retryAfterSec} seconds before generating again.`
    });
  }

  // 3. Validate prompt & parameters BEFORE reserving credit
  const prompt = String(body.prompt || "").trim();
  const description = String(body.description || body.additionalInstructions || "").trim();
  const stylePreset = String(body.stylePreset || "").trim();
  const aspectRatio = String(body.aspectRatio || "1:1").trim();
  const processingMode = String(body.processingMode || "VS-CHAR-2.4").trim();
  const requestedWidth = body.width;
  const requestedHeight = body.height;
  const guidance = body.guidance !== undefined ? body.guidance : 3.5;
  const seed = body.seed !== undefined && body.seed !== "" ? body.seed : null;

  if (!prompt || prompt.length < 3 || prompt.length > 1000) {
    return res.status(400).json({
      code: "MISSING_PROMPT",
      message: "Please enter a prompt between 3 and 1,000 characters."
    });
  }

  // Collect optional reference images from multipart upload or stored referenceImagePath
  const rawReferenceInputs = [];
  const uploadedFiles = Array.isArray(req.files) ? req.files : [];
  for (const f of uploadedFiles.slice(0, 4)) {
    if (f && f.buffer && f.buffer.length > 0) {
      rawReferenceInputs.push({
        buffer: f.buffer,
        originalName: f.originalname || "reference.jpg"
      });
    }
  }

  // Also support base64 reference image or storage path passed in JSON
  if (rawReferenceInputs.length === 0 && body.referenceImageBase64) {
    const cleanB64 = String(body.referenceImageBase64).replace(
      /^data:image\/[a-zA-Z0-9+.-]+;base64,/,
      ""
    );
    const buf = Buffer.from(cleanB64, "base64");
    if (buf.length > 0) {
      rawReferenceInputs.push({
        buffer: buf,
        originalName: body.referenceFileName || "reference.jpg"
      });
    }
  }

  const referenceImagePath = String(body.referenceImagePath || body.referenceImage || "").trim();
  if (
    rawReferenceInputs.length === 0 &&
    referenceImagePath &&
    referenceImagePath.startsWith(`${userId}/`) &&
    supabaseAdmin
  ) {
    try {
      const { data: blobData, error: dlErr } = await supabaseAdmin.storage
        .from("generation-inputs")
        .download(referenceImagePath);
      if (!dlErr && blobData) {
        const arrBuf = await blobData.arrayBuffer();
        rawReferenceInputs.push({
          buffer: Buffer.from(arrBuf),
          originalName: path.basename(referenceImagePath),
          existingStoragePath: referenceImagePath
        });
      }
    } catch (_) {}
  }

  // Pre-validate reference images BEFORE deducting any credit
  const validatedReferences = [];
  try {
    for (const refInput of rawReferenceInputs) {
      const prep = await prepareReferenceImageBuffer(refInput.buffer, refInput.originalName);
      prep.existingStoragePath = refInput.existingStoragePath || "";
      validatedReferences.push(prep);
    }
  } catch (imgErr) {
    const profile = await getOrInitUserProfile(auth.user);
    return res.status(imgErr.status || 400).json({
      code: imgErr.code || "INVALID_IMAGE",
      credits: profile.credits,
      remainingCredits: profile.credits,
      maxCredits: INITIAL_CREDITS,
      message: imgErr.message
    });
  }

  // Check current credit balance & engine configuration BEFORE reserving credit
  const preProfile = await getOrInitUserProfile(auth.user);
  if (preProfile.credits < 1) {
    return res.status(403).json({
      code: "INSUFFICIENT_CREDITS",
      error: "SANDBOX_QUOTA_EXCEEDED",
      credits: 0,
      remainingCredits: 0,
      maxCredits: INITIAL_CREDITS,
      message:
        "Your 2 free credits have been used. Contact founder@vidsynth.app to request an additional credit allocation."
    });
  }

  if (!generationEngine.isConfigured()) {
    return res.status(503).json({
      code: "ENGINE_NOT_CONFIGURED",
      credits: preProfile.credits,
      remainingCredits: preProfile.credits,
      maxCredits: INITIAL_CREDITS,
      message:
        "The VidSynth AI image generation engine is awaiting server-side provider configuration. Your credits were not deducted."
    });
  }

  // Acquire concurrency lock & reserve 1 credit atomically
  activeGenerationUsers.add(userId);
  const generationId = crypto.randomUUID();
  const title =
    String(body.title || "").trim() ||
    prompt.slice(0, 52) + (prompt.length > 52 ? "..." : "");
  const isImageEdit = validatedReferences.length > 0;
  let creditReserved = false;
  let reservationInfo = null;

  try {
    reservationInfo = await reserveGenerationCredit(
      auth.user,
      generationId,
      `VidSynth AI ${isImageEdit ? "Image Edit" : "Image Generation"}: ${title}`
    );
    creditReserved = true;

    const nowIso = new Date().toISOString();
    let primaryInputStoragePath = referenceImagePath || "";
    let primaryInputSignedUrl = "";

    // Store reference image in private `generation-inputs` bucket if uploaded directly
    if (validatedReferences.length > 0 && supabaseAdmin) {
      const firstRef = validatedReferences[0];
      if (!primaryInputStoragePath) {
        primaryInputStoragePath = `${userId}/ref_${generationId}.${firstRef.ext}`;
        await supabaseAdmin.storage
          .from("generation-inputs")
          .upload(primaryInputStoragePath, firstRef.buffer, {
            contentType: firstRef.mimeType,
            upsert: true
          });
      }
      const { data: sIn } = await supabaseAdmin.storage
        .from("generation-inputs")
        .createSignedUrl(primaryInputStoragePath, 3600);
      if (sIn && sIn.signedUrl) {
        primaryInputSignedUrl = sIn.signedUrl;
      }
    }

    // Also save input reference to local authenticated cache
    if (validatedReferences.length > 0) {
      try {
        fs.writeFileSync(
          path.join(ASSETS_CACHE_DIR, `${generationId}_input.${validatedReferences[0].ext}`),
          validatedReferences[0].buffer
        );
      } catch (_) {}
    }

    // Execute real Cloudflare Workers AI request
    const aiResult = await generationEngine.generate({
      prompt,
      description,
      stylePreset,
      aspectRatio,
      width: requestedWidth,
      height: requestedHeight,
      guidance,
      seed,
      referenceImages: validatedReferences
    });

    // Save generated output to persistent storage (`generation-outputs` bucket + local authenticated cache)
    const outputStoragePath = `${userId}/${generationId}.${aiResult.ext}`;
    const localOutputFile = path.join(ASSETS_CACHE_DIR, `${generationId}.${aiResult.ext}`);
    let storageSaved = false;
    let outputSignedUrl = "";

    try {
      fs.writeFileSync(localOutputFile, aiResult.buffer);
      storageSaved = true;
    } catch (_) {}

    if (supabaseAdmin) {
      const { error: outUpErr } = await supabaseAdmin.storage
        .from("generation-outputs")
        .upload(outputStoragePath, aiResult.buffer, {
          contentType: aiResult.mimeType,
          upsert: true
        });
      if (!outUpErr) {
        storageSaved = true;
        const { data: outSigned } = await supabaseAdmin.storage
          .from("generation-outputs")
          .createSignedUrl(outputStoragePath, 3600);
        if (outSigned && outSigned.signedUrl) {
          outputSignedUrl = outSigned.signedUrl;
        }
      }
    }

    if (!storageSaved) {
      const persistErr = new Error(
        "Generated image could not be saved to persistent storage. Your credit has been refunded."
      );
      persistErr.code = "STORAGE_PERSISTENCE_FAILED";
      persistErr.status = 500;
      throw persistErr;
    }

    const finalOutputUrl =
      outputSignedUrl || `/api/generations/${generationId}/asset?type=output`;
    const finalInputUrl =
      primaryInputSignedUrl ||
      (isImageEdit ? `/api/generations/${generationId}/asset?type=input` : "");

    const completedRecord = {
      id: generationId,
      user_id: userId,
      request_id: requestId,
      title,
      description,
      prompt,
      negative_prompt: "",
      model_id: "vs-flux-2-klein-4b",
      generation_type: "image",
      workflow_mode: isImageEdit ? "image-to-image" : "text-to-image",
      style_preset: stylePreset,
      aspect_ratio: aspectRatio,
      processing_mode: processingMode,
      width: aiResult.width,
      height: aiResult.height,
      guidance: aiResult.guidance,
      seed: aiResult.seed,
      reference_metadata: validatedReferences.map((r) => ({
        originalName: r.originalName,
        originalWidth: r.originalWidth,
        originalHeight: r.originalHeight,
        preparedWidth: r.width,
        preparedHeight: r.height,
        mimeType: r.mimeType
      })),
      input_storage_path: primaryInputStoragePath,
      input_image_url: finalInputUrl,
      output_storage_path: outputStoragePath,
      output_image_url: finalOutputUrl,
      output_mime_type: aiResult.mimeType,
      output_ext: aiResult.ext,
      output_video_url: "",
      credit_transaction_id: reservationInfo.transactionId,
      status: "completed",
      error_message: "",
      created_at: nowIso,
      completed_at: new Date().toISOString()
    };

    await saveGenerationRecord(completedRecord);

    const responsePayload = {
      ok: true,
      status: "completed",
      generation: completedRecord,
      imageUrl: finalOutputUrl,
      inputImageUrl: finalInputUrl,
      mimeType: aiResult.mimeType,
      outputMimeType: aiResult.mimeType,
      fileExtension: aiResult.ext,
      outputExtension: aiResult.ext,
      width: aiResult.width,
      height: aiResult.height,
      aspectRatio,
      guidance: aiResult.guidance,
      seed: aiResult.seed,
      mode: isImageEdit ? "image-to-image" : "text-to-image",
      credits: reservationInfo.remainingCredits,
      remainingCredits: reservationInfo.remainingCredits,
      maxCredits: INITIAL_CREDITS
    };

    processedRequestIds.set(requestId, responsePayload);
    return res.status(200).json(responsePayload);
  } catch (err) {
    let currentCredits = preProfile.credits;
    let refunded = false;

    if (creditReserved) {
      currentCredits = await refundReservedCreditOnce(
        auth.user,
        generationId,
        `Refund: ${err.code || "GENERATION_FAILED"}`
      );
      refunded = true;
    }

    // Record failed attempt in user history without saving fake output
    await saveGenerationRecord({
      id: generationId,
      user_id: userId,
      request_id: requestId,
      title,
      description,
      prompt,
      model_id: "vs-flux-2-klein-4b",
      generation_type: "image",
      workflow_mode: isImageEdit ? "image-to-image" : "text-to-image",
      style_preset: stylePreset,
      aspect_ratio: aspectRatio,
      processing_mode: processingMode,
      input_storage_path: "",
      input_image_url: "",
      output_storage_path: "",
      output_image_url: "",
      output_mime_type: "",
      status: "failed",
      error_message: err.message || "Generation failed",
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString()
    });

    return res.status(err.status || 502).json({
      code: err.code || "GENERATION_FAILED",
      refunded,
      credits: currentCredits,
      remainingCredits: currentCredits,
      maxCredits: INITIAL_CREDITS,
      message:
        err.message ||
        "Image generation could not be completed. Your credit was refunded automatically."
    });
  } finally {
    activeGenerationUsers.delete(userId);
  }
};

app.post(
  "/api/generate-or-edit",
  (req, res, next) => {
    upload.any()(req, res, (multerErr) => {
      if (multerErr) {
        const isSize = multerErr.code === "LIMIT_FILE_SIZE";
        return res.status(400).json({
          code: isSize ? "IMAGE_TOO_LARGE" : "UPLOAD_ERROR",
          message: isSize
            ? "Uploaded reference image exceeds the 10 MB size limit."
            : "Could not read uploaded image file."
        });
      }
      next();
    });
  },
  handleGenerateOrEdit
);

app.post(
  "/api/studio/generate",
  (req, res, next) => {
    upload.any()(req, res, (multerErr) => {
      if (multerErr) {
        return res.status(400).json({
          code: "UPLOAD_ERROR",
          message: "Could not process uploaded file."
        });
      }
      next();
    });
  },
  handleGenerateOrEdit
);

// ----------------------------------------------------------------------------
// 5. User Generation Library & Authenticated Private Asset Delivery
// ----------------------------------------------------------------------------
app.get("/api/generations", async (req, res) => {
  const auth = await getAuthenticatedSupabaseUser(req);
  if (!auth) {
    return res.status(401).json({ code: "AUTH_REQUIRED", message: "Authentication required." });
  }
  const items = await listUserGenerations(auth.user.id);
  return res.json({ generations: items });
});

app.get("/api/generations/:id/asset", async (req, res) => {
  const auth = await getAuthenticatedSupabaseUser(req);
  if (!auth) {
    return res.status(401).json({ code: "AUTH_REQUIRED", message: "Authentication required." });
  }
  const genId = String(req.params.id || "").trim();
  const assetType = req.query.type === "input" ? "input" : "output";
  const record = mirrorDb.generations.find(
    (g) => g.id === genId && g.user_id === auth.user.id
  );
  if (!record) {
    return res.status(404).json({ code: "NOT_FOUND", message: "Asset not found." });
  }

  for (const ext of ["jpg", "png", "webp"]) {
    const suffix = assetType === "input" ? `_input.${ext}` : `.${ext}`;
    const candidate = path.join(ASSETS_CACHE_DIR, `${genId}${suffix}`);
    if (fs.existsSync(candidate)) {
      const buf = fs.readFileSync(candidate);
      const det = detectImageMimeAndExt(buf) || { mimeType: "image/jpeg", ext: "jpg" };
      res.setHeader("Content-Type", det.mimeType);
      res.setHeader(
        "Content-Disposition",
        `${req.query.download === "1" ? "attachment" : "inline"}; filename="vidsynth-${genId.slice(0, 8)}.${det.ext}"`
      );
      return res.send(buf);
    }
  }

  if (supabaseAdmin) {
    const bucket = assetType === "input" ? "generation-inputs" : "generation-outputs";
    const storagePath =
      assetType === "input" ? record.input_storage_path : record.output_storage_path;
    if (storagePath) {
      const { data: blobData, error } = await supabaseAdmin.storage
        .from(bucket)
        .download(storagePath);
      if (!error && blobData) {
        const buf = Buffer.from(await blobData.arrayBuffer());
        const det = detectImageMimeAndExt(buf) || { mimeType: "image/jpeg", ext: "jpg" };
        res.setHeader("Content-Type", det.mimeType);
        res.setHeader(
          "Content-Disposition",
          `${req.query.download === "1" ? "attachment" : "inline"}; filename="vidsynth-${genId.slice(0, 8)}.${det.ext}"`
        );
        return res.send(buf);
      }
    }
  }

  return res.status(404).json({ code: "ASSET_NOT_FOUND", message: "Asset file not found." });
});

app.delete("/api/generations/:id", async (req, res) => {
  const auth = await getAuthenticatedSupabaseUser(req);
  if (!auth) {
    return res.status(401).json({ code: "AUTH_REQUIRED", message: "Authentication required." });
  }
  const genId = String(req.params.id || "").trim();
  const userId = auth.user.id;

  const existing = mirrorDb.generations.find((g) => g.id === genId && g.user_id === userId);
  if (!existing) {
    // Ensure users cannot delete another user's generation
    return res.status(404).json({ code: "NOT_FOUND", message: "Generation record not found." });
  }

  if (supabaseAdmin) {
    if (existing.input_storage_path) {
      try {
        await supabaseAdmin.storage.from("generation-inputs").remove([existing.input_storage_path]);
      } catch (_) {}
    }
    if (existing.output_storage_path) {
      try {
        await supabaseAdmin.storage.from("generation-outputs").remove([existing.output_storage_path]);
      } catch (_) {}
    }
    try {
      await supabaseAdmin.from("generations").delete().eq("id", genId).eq("user_id", userId);
    } catch (_) {}
  }

  for (const ext of ["jpg", "png", "webp"]) {
    for (const suffix of [`.${ext}`, `_input.${ext}`]) {
      const f = path.join(ASSETS_CACHE_DIR, `${genId}${suffix}`);
      if (fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
        } catch (_) {}
      }
    }
  }

  mirrorDb.generations = mirrorDb.generations.filter(
    (g) => !(g.id === genId && g.user_id === userId)
  );
  saveMirrorDb(mirrorDb);

  return res.json({ deleted: true, id: genId });
});

// ----------------------------------------------------------------------------
// 6. Account Deletion & Developer API / Early Access Endpoints
// ----------------------------------------------------------------------------
app.delete("/api/account", async (req, res) => {
  const auth = await getAuthenticatedSupabaseUser(req);
  if (!auth) {
    return res.status(401).json({ code: "AUTH_REQUIRED", message: "Authentication required." });
  }
  try {
    const body = req.body || {};
    const confirmVal = String(body.confirmText || body.confirmation || "").trim();
    if (confirmVal !== "DELETE") {
      return res.status(400).json({
        message: 'Please type "DELETE" to confirm permanent account deletion.'
      });
    }

    const userId = auth.user.id;

    // Remove local cached files for this user's generations
    const userGens = mirrorDb.generations.filter((g) => g.user_id === userId);
    for (const g of userGens) {
      for (const ext of ["jpg", "png", "webp"]) {
        for (const suffix of [`.${ext}`, `_input.${ext}`]) {
          const p = path.join(ASSETS_CACHE_DIR, `${g.id}${suffix}`);
          if (fs.existsSync(p)) {
            try {
              fs.unlinkSync(p);
            } catch (_) {}
          }
        }
      }
    }

    if (supabaseAdmin) {
      for (const bucket of ["avatars", "generation-inputs", "generation-outputs"]) {
        try {
          const { data: files } = await supabaseAdmin.storage.from(bucket).list(userId);
          if (Array.isArray(files) && files.length > 0) {
            await supabaseAdmin.storage
              .from(bucket)
              .remove(files.map((f) => `${userId}/${f.name}`));
          }
        } catch (_) {}
      }
      await supabaseAdmin.auth.admin.deleteUser(userId);
    }

    delete mirrorDb.profiles[userId];
    mirrorDb.generations = mirrorDb.generations.filter((g) => g.user_id !== userId);
    mirrorDb.creditTransactions = mirrorDb.creditTransactions.filter((t) => t.user_id !== userId);
    saveMirrorDb(mirrorDb);

    return res.json({
      deleted: true,
      ok: true,
      message: "Your VidSynth AI account and associated assets have been permanently deleted."
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

app.post("/api/developer-access", async (req, res) => {
  try {
    const body = req.body || {};
    const fullName = String(body.fullName || body.full_name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const company = String(body.company || "").trim();
    const website = String(body.website || "").trim();
    const intendedUseCase = String(body.intendedUseCase || body.use_case || "").trim();
    const expectedUsage = String(body.expectedUsage || body.expected_volume || "").trim();
    const additionalDescription = String(body.additionalDescription || "").trim();

    if (fullName.length < 2) {
      return res.status(400).json({ message: "Please enter your full name." });
    }
    if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
      return res.status(400).json({ message: "Please enter a valid work email address." });
    }
    if (company.length < 2) {
      return res.status(400).json({ message: "Please enter your company or organization name." });
    }
    if (!intendedUseCase) {
      return res.status(400).json({ message: "Please specify your intended use case." });
    }

    const auth = await getAuthenticatedSupabaseUser(req);
    const entry = {
      id: crypto.randomUUID(),
      user_id: auth && auth.user ? auth.user.id : null,
      full_name: fullName,
      email,
      company,
      website,
      intended_use_case: intendedUseCase,
      expected_usage: expectedUsage,
      additional_description: additionalDescription,
      status: "pending_review",
      created_at: new Date().toISOString()
    };

    if (supabaseAdmin) {
      try {
        await supabaseAdmin.from("developer_api_requests").insert(entry);
      } catch (_) {}
    }
    mirrorDb.developerApiRequests.unshift(entry);
    saveMirrorDb(mirrorDb);

    return res.status(201).json({
      submitted: true,
      ok: true,
      message:
        "Your Developer API Private Beta application has been recorded. For priority enterprise evaluation, contact founder@vidsynth.app."
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

app.get("/api/early-access/stats", (_req, res) => {
  res.json({
    verified: true,
    verifiedCount: mirrorDb.earlyAccessSubmissions.length,
    verifiedSubmissionsCount: mirrorDb.earlyAccessSubmissions.length
  });
});

app.post("/api/early-access", async (req, res) => {
  try {
    const body = req.body || {};
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const interest = String(body.interest || "").trim();

    if (name.length < 2) {
      return res.status(400).json({ message: "Please enter your name." });
    }
    if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
      return res.status(400).json({ message: "Please enter a valid email address." });
    }

    if (supabaseAdmin) {
      try {
        await supabaseAdmin.from("early_access_requests").insert({
          name,
          email,
          interest: interest || "Early Access",
          source: String(body.source || "website")
        });
      } catch (_) {}
    }

    if (!mirrorDb.earlyAccessSubmissions.some((s) => s.email === email)) {
      mirrorDb.earlyAccessSubmissions.push({
        id: crypto.randomUUID(),
        name,
        email,
        interest: interest || "Early Access",
        created_at: new Date().toISOString()
      });
      saveMirrorDb(mirrorDb);
    }

    return res.status(201).json({
      submitted: true,
      ok: true,
      message:
        "Thank you for joining VidSynth AI Early Access. Our team has recorded your request.",
      verifiedCount: mirrorDb.earlyAccessSubmissions.length
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

// Dedicated Password Recovery & Account Route Handlers
app.get("/forgot-password", (_req, res) => {
  res.sendFile("forgot-password.html", { root: ROOT_DIR });
});

app.get("/reset-password", (_req, res) => {
  res.sendFile("reset-password.html", { root: ROOT_DIR });
});

app.get("/profile", (_req, res) => {
  res.sendFile("index.html", { root: ROOT_DIR });
});

// Support both /assets/... and /public/assets/... paths
app.use("/public/assets", express.static(path.join(ROOT_DIR, "assets"), { dotfiles: "deny" }));

// Serve static assets with range support
app.use(express.static(ROOT_DIR, { index: "index.html", dotfiles: "deny" }));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`VidSynth AI Server running at http://localhost:${PORT}`);
  });
}

module.exports = { app, server: app, generationEngine, prepareReferenceImageBuffer };
