import mongoose, { InferSchemaType, model, Schema } from "mongoose";

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

let connectionPromise: Promise<typeof mongoose> | null = null;

export function connectToDatabase(): Promise<typeof mongoose> {
  if (connectionPromise) return connectionPromise;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI environment variable is not set");
  connectionPromise = mongoose.connect(uri);
  return connectionPromise;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const userSchema = new Schema(
  {
    // firebaseUid is the primary lookup key from Firebase auth tokens
    firebaseUid: { type: String, required: true, unique: true, index: true },
    displayName: { type: String, required: false, default: "" },
    email: { type: String, required: true },

    permissions: [{ type: String, enum: ["admin", "comments", "jumpdocs"] }],
    // apiKeys: arbitrary named keys the user has generated
    apiKeys: { type: Map, of: String, default: {} },

    // Storage quotas. Defaults give new users 50 MB / 50 MB.
    imageUsage: {
      maxBytes: { type: Number, required: true, default: 50 * 1024 * 1024 },
      currentBytes: { type: Number, required: true, default: 0 },
    },
    pdfUsage: {
      maxBytes: { type: Number, required: true, default: 50 * 1024 * 1024 },
      currentBytes: { type: Number, required: true, default: 0 },
    },
  },
  {
    minimize: false,
    collection: "users",
    timestamps: { createdAt: "createdAt", updatedAt: false },
  },
);

export type IUser = InferSchemaType<typeof userSchema>;

// ---------------------------------------------------------------------------

const imageSchema = new Schema(
  {
    // ownerUid references Users.firebaseUid
    ownerUid: { type: String, required: true, index: true },
    // Which documents reference this image. Use "docType" not "type" to avoid
    // conflicting with Mongoose's reserved schema keyword.
    usedIn: [
      {
        docType: { type: String, enum: ["chain", "jumpdoc"], required: true },
        docId: { type: String, required: true },
      },
    ],

    // Public path/URL used to serve this image
    path: { type: String, required: true },

    uploadType: { type: String, enum: ["native", "imagechest"], required: true },
    // Only present when uploadType === "imagechest"
    imageChestParameters: { postId: String, deleteURL: String },
    // Only present when uploadType === "native"
    backblazeFileId: String,

    // When set, this image will be GC'd after N days (e.g. orphaned images)
    daysToDeletion: Number,

    bytes: { type: Number, required: true },
  },
  {
    minimize: false,
    collection: "images",
    timestamps: { createdAt: "createdAt", updatedAt: false },
  },
);

export type IImage = InferSchemaType<typeof imageSchema>;

// ---------------------------------------------------------------------------

const pdfSchema = new Schema(
  {
    ownerUid: { type: String, required: true, index: true },
    // A PDF belongs to exactly one jumpdoc
    usedInDocId: { type: String, required: true },

    path: { type: String, required: true },
    backblazeFileId: String,

    bytes: { type: Number, required: true },
  },
  {
    minimize: false,
    collection: "pdfs",
    timestamps: { createdAt: "createdAt", updatedAt: false },
  },
);

export type IPDF = InferSchemaType<typeof pdfSchema>;

// ---------------------------------------------------------------------------

const chainSchema = new Schema(
  {
    // Opaque blob — the full serialised Chain object
    contents: { type: Schema.Types.Mixed, required: true },
    // Denormalized from contents.name for efficient querying without scanning the blob.
    // Must be kept in sync on every save.
    name: { type: String, index: true },
    ownerUid: { type: String, index: true },
    // Stable public-facing identifier (e.g. for share links), separate from _id
    publicUid: { type: String, required: true, unique: true, index: true },
    edits: { type: Number, required: true, default: 0 },
    version: { type: String, required: true },
  },
  {
    minimize: false,
    collection: "chains",
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  },
);

export type IChain = InferSchemaType<typeof chainSchema>;

// ---------------------------------------------------------------------------

const jumpdocSchema = new Schema(
  {
    contents: { type: Schema.Types.Mixed, required: true },
    // Denormalized from contents.name for efficient querying/sorting without
    // scanning the full contents blob. Must be kept in sync on every save.
    name: { type: String, required: true, index: true },
    // Denormalized from contents.author (comma-separated string → array of trimmed names)
    // for efficient author searching. Must be kept in sync on every save.
    author: { type: [String], index: true },
    // Optional cover image reference (Image._id)
    imageId: String,
    // Required PDF reference (PDF._id)
    pdf: { type: String, required: true },
    attributes: {
      genre: { type: [String], index: true },
      medium: { type: [String], index: true },
      franchise: { type: [String], index: true },
      supernaturalElements: { type: [String], index: true },
    },
    ownerUid: { type: String, index: true },
    publicUid: { type: String, required: true, unique: true, index: true },
    published: { type: Boolean, required: true, default: false },
    nsfw: { type: Boolean, required: true, default: false },
    edits: { type: Number, required: true, default: 0 },
    version: { type: String, required: true },
  },
  {
    minimize: false,
    collection: "jumpdocs",
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  },
);

export type IJumpDoc = InferSchemaType<typeof jumpdocSchema>;

// ---------------------------------------------------------------------------

const purchaseSchema = new Schema(
  {
    // JumpDoc.publicUid — stable sync key; indexed for fast delete-all-for-doc
    docId: { type: String, required: true, index: true },
    // Numeric TID.Purchase key within the doc's availablePurchases registry
    templateId: { type: Number, required: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    choiceContext: { type: String },
    // "perk" | "item" — derived from the template's PurchaseSubtype.type
    purchaseType: { type: String, required: true },
    // kind "cp": costs the default currency (TID key 0); amount is the CP value.
    // kind "custom": costs a non-default currency (not meaningfully comparable).
    cost: {
      kind: { type: String, required: true },
      amount: { type: Number },
    },
    // True when this template appears as a reward in any scenario's rewardGroups.
    isScenarioReward: { type: Boolean, required: true },
    docName: { type: String, required: true },
    published: { type: Boolean, required: true, index: true },
    nsfw: { type: Boolean, required: true, index: true },
  },
  {
    minimize: false,
    collection: "purchases",
    timestamps: { createdAt: "createdAt", updatedAt: false },
  },
);

// Text index for name/description search; compound index for multi-field queries.
purchaseSchema.index({ name: "text", description: "text" });

export type IPurchase = InferSchemaType<typeof purchaseSchema>;

// ---------------------------------------------------------------------------
// Models
// Guard against "Cannot overwrite model once compiled" on hot-reload in dev.
// ---------------------------------------------------------------------------

export const Models = {
  User: mongoose.models["User"] ?? model<IUser>("User", userSchema),
  Chain: mongoose.models["Chain"] ?? model<IChain>("Chain", chainSchema),
  JumpDoc: mongoose.models["JumpDoc"] ?? model<IJumpDoc>("JumpDoc", jumpdocSchema),
  Image: mongoose.models["Image"] ?? model<IImage>("Image", imageSchema),
  PDF: mongoose.models["PDF"] ?? model<IPDF>("PDF", pdfSchema),
  Purchase: mongoose.models["Purchase"] ?? model<IPurchase>("Purchase", purchaseSchema),
};
