import { Request, Response } from "express";
import { AppError } from "../../errors/AppError";
import Post from "../../models/blog/PostModel";
import Category from "../../models/blog/CategoryModel";
import Tag from "../../models/blog/TagModel";
import { generateUniqueSlug } from "./blog.helper";
import { Types } from "mongoose";
import Profile from "../../models/user/ProfileModel";
import Author from "../../models/blog/AuthorModel";

export const saveOrPublishPost = async (req: Request, res: Response) => {
  const {
    title,
    timeRead,
    content,
    summary,
    imageUrl,
    metaTitle,
    metaDesc,
    metaKeywords,
    metaImage,
    categories,
    tags,
  } = req.body;

  const { publish } = req.query; // Get the query parameter for publish
  const author = (req as any).author;

  const authorId = author._id;

  // Validate required fields based on publish status
  let requiredFields = ["title"]; // Only title is required if not publishing
  if (publish === "true") {
    // Add all other fields as required when publishing
    requiredFields = [
      "title",
      "timeRead",
      "content",
      "summary",
      "metaTitle",
      "metaDesc",
      "metaKeywords",
      "categories",
      "tags",
    ];
  }

  const missingFields = requiredFields.filter((field) => !req.body[field]);
  if (missingFields.length > 0) {
    throw new AppError(
      `Missing required fields: ${missingFields.join(", ")}`,
      400
    );
  }

  // Create or connect categories
  const categoriesToConnectOrCreate = categories.map(
    async (category: string) => {
      let categoryDoc = await Category.findOne({
        slug: generateUniqueSlug(category),
      });
      if (!categoryDoc) {
        categoryDoc = await Category.create({
          name: category,
          slug: generateUniqueSlug(category),
        });
      }
      return categoryDoc._id;
    }
  );

  // Create or connect tags
  const tagsToConnectOrCreate = tags.map(async (tag: string) => {
    let tagDoc = await Tag.findOne({ slug: generateUniqueSlug(tag) });
    if (!tagDoc) {
      tagDoc = await Tag.create({ name: tag, slug: generateUniqueSlug(tag) });
    }
    return tagDoc._id;
  });

  // Wait for all categories and tags to be populated
  const [categoryIds, tagIds] = await Promise.all([
    Promise.all(categoriesToConnectOrCreate),
    Promise.all(tagsToConnectOrCreate),
  ]);

  // Prepare data for saving the post
  const postData = {
    title,
    timeRead,
    content,
    summary,
    imageUrl,
    metaData: {
      metaTitle,
      metaDesc,
      metaKeywords,
      metaImage,
    },
    authorId: authorId,
    categories: categoryIds,
    tags: tagIds,
    status: publish === "true" ? "PUBLISHED" : "DRAFT",
    published: publish === "true" ? true : false,
  };
  const newPost = new Post(postData);
  // Create a new post
  await newPost.saveSlug();
  await newPost.save();

  if (!newPost) {
    throw new AppError("Post not created", 400);
  }

  //updating author
  author.posts.push(newPost._id);
  await author.save();
  await Promise.all(
    categoryIds.map(async (categoryId) => {
      const category = await Category.findById(categoryId);
      if (category) {
        category.posts.push(newPost._id as Types.ObjectId); // Add new post ID to the category's posts
        await category.save();
      }
    })
  );

  await Promise.all(
    tagIds.map(async (tagId) => {
      const tag = await Tag.findById(tagId);
      if (tag) {
        tag.posts.push(newPost._id as Types.ObjectId); // Add new post ID to the category's posts
        await tag.save();
      }
    })
  );

  res.status(200).json({
    success: true,
    data: {
      slug: newPost.slug,
    },
  });
};

export const getAllPosts = async (req: Request, res: Response) => {
  const role = (req as any).role;
  const userId = (req as any).userId;
  if (role != "ADMIN" && role != "AUTHOR") {
    throw new AppError("Not Authorized to get the posts", 400);
  }

  const {
    recent = false,
    category,
    random = false,
    take = 10,
    skip = 0,
  } = req.query;

  // Define the base filter criteria (only published posts)
  const whereClause: any = {};

  if (role == "AUTHOR") {
    const author = await Author.findOne({ userId: userId });
    if (!author) {
      throw new AppError("Author not found", 404);
    }
    whereClause.authorId = author._id;
  }

  // If a category is specified, filter by category
  if (category) {
    const categoryPosts = await Category.findOne({ slug: category }).populate([
      {
        path: "posts", // Populate the 'posts' field
        select: "slug -_id title imageUrl publishedAt summary metaData", // Select only the required fields for posts
        match: whereClause,
        populate: [
          {
            path: "categories", // Populate the 'user' field within posts
            select: "name slug -_id", // Select only the 'name' and 'image' fields from the 'user' model
          },
          {
            path: "tags", // Populate the 'user' field within posts
            select: "name slug -_id",
          },
          {
            path: "authorId",
            select: "name image -_id",
          },
        ],
      },
    ]);
    if (!categoryPosts || categoryPosts.posts.length === 0) {
      throw new AppError("Category not found", 404);
    }
    return res.status(200).json({
      success: true,
      data: categoryPosts.posts,
    });
  }

  // Build the Mongoose query
  let postsQuery: any = {
    where: whereClause,
    select: {
      _id: false,
      title: true,
      slug: true,
      imageUrl: true,
      publishedAt: true,
      summary: true,
      metaData: true,
      published: true,
      timeRead: true,
    },
    skip: parseInt(skip as string), // Skip for pagination
    limit: parseInt(take as string), // Limit the number of posts per page
  };

  // Sort by recent if needed
  if (recent === "true") {
    postsQuery.sort = { publishedAt: -1 }; // Sort by most recent
  }

  // If "random" is provided, fetch more posts and shuffle later
  if (random === "true") {
    postsQuery.limit = 100; // Fetch more posts than required for randomness
  }

  // Fetch posts from the database and populate categories and tags
  const posts = await Post.find(whereClause)
    .select(postsQuery.select)
    .skip(postsQuery.skip)
    .limit(postsQuery.limit)
    .sort(postsQuery.sort)
    .populate("categories", "name slug -_id") // Only select 'name' and 'slug' from categories
    .populate("tags", "name slug -_id")
    .populate("authorId", "userId -_id")
    .lean();

  if (!posts || posts.length === 0) {
    throw new AppError("No posts found for the specified filters", 404);
  }

  // Use Promise.all to ensure author info is fetched for each post
  const postsWithAuthor = await Promise.all(
    posts.map(async (post) => {
      const author = await Profile.findOne({
        userId: (post.authorId as any)?.userId,
      }).select("firstName lastName email -_id");

      if (author) {
        (post as any).author = {
          firstName: author.firstName,
          lastName: author.lastName,
          email: author.email,
        };
      }
      delete post.authorId;
      return post;
    })
  );

  // If random is true, shuffle the posts and limit them
  if (random === "true") {
    postsWithAuthor.sort(() => Math.random() - 0.5); // Shuffle array
    postsWithAuthor.splice(parseInt(take as string)); // Limit to 'take' number of posts
  }

  return res.status(200).json({
    success: true,
    data: postsWithAuthor,
  });
};

export const getPostContent = async (req: Request, res: Response) => {
  const { slug } = req.params;
  const role = (req as any).role;
  const userId = (req as any).userId;

  if (role != "ADMIN" && role != "AUTHOR") {
    throw new AppError("Not Authorized to get the posts", 400);
  }

  if (!slug) {
    throw new AppError("Slug is required", 400);
  }

  const whereClause: any = {
    slug,
  };
  let bio;
  if (role == "AUTHOR") {
    const author = await Author.findOne({ userId: userId });

    if (!author) {
      throw new AppError("Author not found", 404);
    }
    bio = author.bio;
    whereClause.authorId = author._id;
  }

  const post = await Post.findOne(whereClause)
    .select({
      _id: false,
      title: true,
      slug: true,
      imageUrl: true,
      publishedAt: true,
      summary: true,
      metaData: true,
      published: true,
      timeRead: true,
      content: true,
    })
    .populate("categories", "name slug -_id")
    .populate("tags", "name slug -_id")
    .populate("authorId", "userId -_id")
    .lean();

  if (!post) {
    throw new AppError("Post not found", 404);
  }

  // Fetch author information
  const author = await Profile.findOne({
    userId: (post.authorId as any)?.userId,
  }).select("firstName lastName email image -_id");

  if (author) {
    (post as any).author = {
      firstName: author.firstName,
      lastName: author.lastName,
      email: author.email,
      image: author.image,
      bio: bio || "",
    };
  }
  delete post.authorId;

  res.status(200).json({
    success: true,
    data: post,
  });
};

export const editPost = async (req: Request, res: Response) => {
  const { slug } = req.params;
  const {
    title,
    timeRead,
    content,
    summary,
    imageUrl,
    metaTitle,
    metaDesc,
    metaKeywords,
    metaImage,
    categories,
    tags,
  } = req.body;
  const role = (req as any).role;
  const userId = (req as any).userId;
  if (role != "ADMIN" && role != "AUTHOR") {
    throw new AppError("Not Authorized to edit the posts", 400);
  }

  const post = await Post.findOne({ slug: slug });
  const categoriesToConnectOrCreate = categories.map(
    async (category: string) => {
      let categoryDoc = await Category.findOne({
        slug: generateUniqueSlug(category),
      });
      if (!categoryDoc) {
        categoryDoc = await Category.create({
          name: category,
          slug: generateUniqueSlug(category),
        });
      }
      return categoryDoc._id;
    }
  );

  // Create or connect tags
  const tagsToConnectOrCreate = tags.map(async (tag: string) => {
    let tagDoc = await Tag.findOne({ slug: generateUniqueSlug(tag) });
    if (!tagDoc) {
      tagDoc = await Tag.create({ name: tag, slug: generateUniqueSlug(tag) });
    }
    return tagDoc._id;
  });
  if (!post) {
    throw new Error("Post not found");
  }

  // Call the editPost method on the found post

  res.status(200).json({
    success: true,
    message: "Post deleted successfully",
  });
};

export const deletePost = async (req: Request, res: Response) => {
  const { slug } = req.params;
  const role = (req as any).role;

  if (role != "ADMIN" && role != "AUTHOR") {
    throw new AppError("Not Authorized to delete the posts", 400);
  }

  if (!slug) {
    throw new AppError("Slug is required", 400);
  }

  const post = await Post.findOne({ slug });
  if (!post) {
    throw new Error("Post not found");
  }

  // Call the deletePost method from the post instance
  await post.deletePost();

  if (!post) {
    throw new AppError("Post not found", 404);
  }

  res.status(200).json({
    success: true,
    message: "Post deleted successfully",
  });
  // Remove post from author's posts array
};
