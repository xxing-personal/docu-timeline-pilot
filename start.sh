#!/bin/bash

# Start the web development server first (in background)
echo "Starting web development server..."
cd web
npm run dev &
WEB_PID=$!

# Wait a moment for frontend to start
sleep 2

# Start the backend server (api) in foreground to see logs
echo "Starting backend server..."
cd ../api
echo "Backend server PID: $WEB_PID"
echo "Backend logs will be visible below:"
echo ""

# Function to cleanup on exit
cleanup() {
    echo "Stopping servers..."
    kill $WEB_PID 2>/dev/null
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Start backend in foreground (logs will be visible)
npm start 