//model for post
import mongoose, { Document, Schema } from "mongoose";
import { DEFAULT_POST_IMAGE } from "../../utils/data";
import { generateUniqueSlug } from "../../api/blog/blog.helper";
import Author from "./AuthorModel";
import Category from "./CategoryModel";
import Tag from "./TagModel";

// Enum for PostStatus
export enum PostStatus {
  DRAFT = "DRAFT",
  PUBLISHED = "PUBLISHED",
  ARCHIVED = "ARCHIVED",
}

// MetaData Interface for better typing
interface IPostMetaData {
  metaTitle?: string;
  metaDesc?: string;
  metaKeywords?: string;
  metaImage: string;
}

interface IPost extends Document {
  title: string;
  views: number;
  publishedAt: Date;
  timeRead?: string;
  slug: string;
  content?: string;
  summary?: string;
  imageUrl: string;
  published: boolean;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  authorId?: mongoose.Types.ObjectId;
  categories: mongoose.Types.ObjectId[];
  tags: mongoose.Types.ObjectId[];
  metaData: IPostMetaData; // Typed metaData
  status: PostStatus;
  saveSlug: () => Promise<string>;
  deletePost: () => Promise<void>;
}

const postSchema: Schema<IPost> = new Schema(
  {
    title: { type: String, required: true, trim: true },
    views: { type: Number, default: 0 },
    publishedAt: { type: Date, default: Date.now },
    timeRead: { type: String, default: null },
    slug: { type: String, unique: true, required: true, trim: true },
    content: { type: String, default: null },
    summary: { type: String, default: null, trim: true },
    imageUrl: { type: String, default: DEFAULT_POST_IMAGE, trim: true },
    published: { type: Boolean, default: false },

    expiresAt: { type: Date, default: null },
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Author",
      default: null,
    },
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
    tags: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tag" }],
    metaData: {
      metaTitle: { type: String, default: null, trim: true },
      metaDesc: { type: String, default: null, trim: true },
      metaKeywords: { type: String, default: null },
      metaImage: { type: String, default: DEFAULT_POST_IMAGE, trim: true },
    },
    status: {
      type: String,
      enum: Object.values(PostStatus),
      default: PostStatus.DRAFT,
    },
  },
  { timestamps: true } // Automatically handle createdAt and updatedAt fields
);

postSchema.methods.deletePost = async function () {
  // Step 1: Remove this post from the Author's posts
  if (this.authorId) {
    await Author.updateOne(
      { userId: this.authorId },
      { $pull: { posts: this._id } }
    );
  }

  // Step 2: Remove this post from the Category's posts
  if (this.categories.length > 0) {
    await Category.updateMany(
      { _id: { $in: this.categories } },
      { $pull: { posts: this._id } }
    );
  }
  if (this.categories.length > 0) {
    await Tag.updateMany(
      { _id: { $in: this.tags } },
      { $pull: { posts: this._id } }
    );
  }

  // Step 3: Now delete the post
  await this.remove();
};

postSchema.methods.saveSlug = async function () {
  const baseSlug = generateUniqueSlug(this.title);
  let slug = baseSlug;
  let slugExists = await Post.findOne({ slug });

  // If the slug already exists, append a number to make it unique
  let counter = 1;
  while (slugExists) {
    slug = `${baseSlug}-${counter}`;
    slugExists = await Post.findOne({ slug });
    counter++;
  }
  this.slug = slug;
  return slug;
};

const Post = mongoose.model<IPost>("Post", postSchema);
export default Post;
