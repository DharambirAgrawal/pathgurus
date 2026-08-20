# Pathgurus

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248?logo=mongodb&logoColor=white)

A full-stack platform for publishing blog articles and structured, multi-section online courses, with a role-based admin dashboard for authoring and managing content.

## Overview

Pathgurus is a monorepo with a Next.js frontend and an Express/MongoDB API. Visitors read blog posts and courses; authenticated authors and admins manage that content through a dashboard with role-gated permissions (`USER`, `AUTHOR`, `ADMIN`). Courses are modeled as ordered groups of sections, blog posts support categories/tags/authors, and both are rendered from MDX with syntax-highlighted code blocks. The project is set up to deploy the client to Vercel and the server (via Docker) to Heroku through a GitHub Actions pipeline.

## Features

- **Blog**: posts with categories, tags, authors, and MDX content rendering (`next-mdx-remote`, `remark-gfm`, `rehype-pretty-code`)
- **Courses**: organized into ordered content groups and sections, with draft/published/archived status and SEO metadata per course and section
- **Admin/author dashboard**: create and edit courses, posts, and content sections; manage users, images, and calendar; drag-and-drop content ordering
- **Role-based access control**: `USER` / `AUTHOR` / `ADMIN` permissions enforced in Next.js middleware, restricting dashboard routes per role
- **Authentication**: email/password with JWT + session cookies, Google OAuth via Passport, email verification, and password reset flows
- **Media management**: image uploads and storage via Cloudinary, with an in-dashboard gallery
- **Newsletter**: subscribe/unsubscribe flow backed by scheduled email jobs (`node-cron`, Nodemailer)
- **SEO**: dynamic sitemap, robots.txt, OpenGraph/Twitter image generation, and per-route metadata
- **Analytics & ads**: Vercel Speed Insights, plus Google Analytics, Ads, and Tag Manager integration

## Tech Stack

**Client**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, `next-mdx-remote` for MDX content, `react-apexcharts` for dashboard charts

**Server**: Express, TypeScript, MongoDB with Mongoose, JWT, `cookie-session` + Passport (Google OAuth 2.0), Cloudinary SDK, Nodemailer, `node-cron`

**Infra**: Docker (separate images for client and server), Docker Compose, GitHub Actions CI/CD deploying the client to Vercel and the server to Heroku

## Project Structure

```
.
├── client/    # Next.js app (App Router, route groups per section)
│   └── src/app/
│       ├── (blog)/       # Public blog
│       ├── (courses)/    # Public course viewer
│       ├── (auth)/       # Sign in / sign up / verification
│       ├── (dashboard)/  # Role-gated author/admin dashboard
│       └── (about)/      # Static pages
└── server/    # Express API
    └── src/
        ├── api/          # Route handlers (auth, blog, courses, media, user)
        ├── models/       # Mongoose schemas
        ├── services/     # Cloudinary, email, Mongo, Passport
        └── middlewares/
```

## Getting Started

### Prerequisites

- Node.js 22+
- A MongoDB instance (local or hosted)
- A Cloudinary account (for media uploads)
- A Google OAuth 2.0 client (for Google sign-in)

### Installation

```bash
git clone https://github.com/DharambirAgrawal/pathgurus.git
cd pathgurus

# server
cd server
npm install

# client
cd ../client
npm install
```

### Configuration

Neither app ships an `.env.example`, so create `server/.env` and set the variables the code reads from `process.env`:

```
PORT=8080
NODE_ENV=DEVELOPMENT
MONGO_URI=
JWT_TOKEN_SECRET=
VERIFY_EMAIL_SECRET=
RESET_PASSWORD_SECRET=
SUSPENDED_ACCOUNT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_SECRET_KEY=
CLOUDINARY_BASE_URL=
EMAIL_USER=
EMAIL_PASSWORD=
BASE_URL=http://localhost:8080
CLIENT_BASE_URL=http://localhost:3000
```

For `client/.env.local`, at minimum:

```
NEXT_PUBLIC_API_URL=http://localhost:8080
```

### Running locally

```bash
# server (from server/)
npm run dev   # ts-node-dev on http://localhost:8080

# client (from client/)
npm run dev   # Next.js on http://localhost:3000
```

### Running with Docker

```bash
docker-compose up --build server
```

(The client service is defined in `docker-compose.yml` but commented out by default.)

## How It Works

- **Content model**: a `Course` document holds ordered `contentGroups`, each referencing `CourseContent` sections stored as separate documents, so sections can be reordered or reused without duplicating content. Blog posts follow a more conventional post/category/tag/author schema.
- **Access control**: the Next.js `middleware.ts` decodes the JWT on each request and checks the user's role against a per-route permission map before allowing access to `/dashboard/*` routes, rather than gating access inside individual pages.
- **Auth**: supports both local email/password (with email verification and password reset via signed JWTs) and Google OAuth via Passport, backed by `cookie-session` for session persistence.
