# Document Timeline Pilot

A PDF processing application with queue management, built with Node.js/Express API (now using `simple-queue-test` as backend) and React web frontend.

> **Note:** The `api/` folder has been deprecated. The backend is now located in `simple-queue-test/`. See `api/DEPRECATED.md` for migration details.

## Project Structure

- `simple-queue-test/` - Express.js API server with PDF processing and queue management (use this as backend)
- `web/` - React frontend with shadcn/ui components
- `uploads/` - Directory for uploaded PDF files
- `extracted-texts/` - Directory for processed PDF text content
- `api/` - **DEPRECATED** - Old backend folder (see DEPRECATED.md)

## Quick Start

### Option 1: Use the provided scripts

```bash
# Build both applications
./build.sh

# Start both development servers
./start.sh
```

### Option 2: Manual setup

#### Prerequisites
- Node.js (v18 or higher)
- npm

#### Build and Run Backend (simple-queue-test)

```bash
cd simple-queue-test
npm install
npx tsc
npm start
```

The backend will run on `http://localhost:3000` by default.

#### Build and Run Web Application

```bash
cd web
npm install
npm run dev
```

The web application will run on `http://localhost:5173`

#### Configure API Base URL (Frontend)

You can set the backend API URL for the frontend using a `.env` file in the `web/` directory:

```
VITE_API_BASE_URL=http://localhost:3000
```

## API Endpoints

- `POST /upload` - Upload PDF files for processing
- `GET /status` - Get all task statuses
- `GET /status/:taskId` - Get specific task status
- `POST /queue/pause` - Pause the processing queue
- `POST /queue/resume` - Resume the processing queue
- `DELETE /tasks/:taskId` - Remove a specific task
- `DELETE /tasks/completed` - Clear all completed tasks
- `POST /tasks/reorder` - Reorder tasks in the queue

## Features

- **PDF Upload & Processing**: Upload multiple PDF files for text extraction
- **Queue Management**: Background processing with configurable concurrency
- **Real-time Status**: Monitor processing status of uploaded files
- **Task Management**: Pause, resume, and manage processing tasks
- **Modern UI**: React frontend with shadcn/ui components
- **TypeScript**: Full type safety across the application

## Development

### Backend Development
The backend uses TypeScript and compiles to JavaScript in the `dist/` directory. Use `npm start` for development with auto-reload.

### Web Development
The web application uses Vite for fast development with hot module replacement. Use `npm run dev` for development.

## Production Deployment

### Build for Production
```bash
./build.sh
```

### Serve Production Build
```bash
# Backend
cd simple-queue-test && npm start

# Web (serve static files)
cd web && npm run preview
```

## Technologies Used

### Backend
- Node.js
- Express.js
- TypeScript
- Multer (file uploads)
- PDF-parse (PDF text extraction)
- Async queue (background processing)

### Frontend
- React 18
- TypeScript
- Vite
- shadcn/ui
- Tailwind CSS
- React Router
- TanStack Query
- React PDF (PDF viewing)

## Project info

**URL**: https://lovable.dev/projects/bf0f4968-8515-4099-8660-de11018c5ce2

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/bf0f4968-8515-4099-8660-de11018c5ce2) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/bf0f4968-8515-4099-8660-de11018c5ce2) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)
