#!/bin/bash

# Start the backend server (simple-queue-test)
echo "Starting backend server..."
cd simple-queue-test
npm start &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 3

# Start the web development server
echo "Starting web development server..."
cd ../web
npm run dev &
WEB_PID=$!

echo "Both servers are starting..."
echo "Backend server PID: $BACKEND_PID"
echo "Web server PID: $WEB_PID"
echo ""
echo "Press Ctrl+C to stop both servers"

# Function to cleanup on exit
cleanup() {
    echo "Stopping servers..."
    kill $BACKEND_PID 2>/dev/null
    kill $WEB_PID 2>/dev/null
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Wait for both processes
wait 