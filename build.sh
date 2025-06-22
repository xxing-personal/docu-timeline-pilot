#!/bin/bash

echo "Building Backend and Web applications..."

# Build Backend (simple-queue-test)
echo "Building Backend..."
cd simple-queue-test
npm install
npx tsc
echo "Backend built successfully"

# Build Web
echo "Building Web application..."
cd ../web
npm install
npm run build
echo "Web application built successfully"

echo ""
echo "Build completed!"
echo "Backend compiled to: simple-queue-test/dist/"
echo "Web built to: web/dist/"
echo ""
echo "To run the backend: cd simple-queue-test && npm start"
echo "To serve the web build: cd web && npm run preview" 