// Example of how to use the PDF Queue Management system
// This demonstrates different ways to interact with the queue

const fetch = require('node-fetch'); // You may need to install: npm install node-fetch
const FormData = require('form-data');
const fs = require('fs');

const API_BASE_URL = 'http://localhost:3000';

// Example 1: Upload a PDF and get task ID
async function uploadPDF(filePath) {
  try {
    const form = new FormData();
    form.append('pdf', fs.createReadStream(filePath));
    
    const response = await fetch(`${API_BASE_URL}/upload`, {
      method: 'POST',
      body: form
    });
    
    const result = await response.json();
    console.log('Upload Result:', result);
    return result.taskId;
  } catch (error) {
    console.error('Upload Error:', error);
  }
}

// Example 2: Check status of a specific task
async function checkTaskStatus(taskId) {
  try {
    const response = await fetch(`${API_BASE_URL}/status/${taskId}`);
    const result = await response.json();
    console.log('Task Status:', result);
    return result;
  } catch (error) {
    console.error('Status Check Error:', error);
  }
}

// Example 3: Get all tasks status
async function getAllTasksStatus() {
  try {
    const response = await fetch(`${API_BASE_URL}/status`);
    const result = await response.json();
    console.log('All Tasks:', result);
    return result;
  } catch (error) {
    console.error('Get All Tasks Error:', error);
  }
}

// Example 4: Get queue statistics
async function getQueueStats() {
  try {
    const response = await fetch(`${API_BASE_URL}/queue/stats`);
    const result = await response.json();
    console.log('Queue Stats:', result);
    return result;
  } catch (error) {
    console.error('Queue Stats Error:', error);
  }
}

// Example 5: Pause/Resume queue
async function pauseQueue() {
  try {
    const response = await fetch(`${API_BASE_URL}/queue/pause`, {
      method: 'POST'
    });
    const result = await response.json();
    console.log('Pause Result:', result);
  } catch (error) {
    console.error('Pause Error:', error);
  }
}

async function resumeQueue() {
  try {
    const response = await fetch(`${API_BASE_URL}/queue/resume`, {
      method: 'POST'
    });
    const result = await response.json();
    console.log('Resume Result:', result);
  } catch (error) {
    console.error('Resume Error:', error);
  }
}

// Example 6: Change concurrency
async function setConcurrency(concurrency) {
  try {
    const response = await fetch(`${API_BASE_URL}/queue/concurrency`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ concurrency })
    });
    const result = await response.json();
    console.log('Concurrency Result:', result);
  } catch (error) {
    console.error('Concurrency Error:', error);
  }
}

// Example 7: Monitor task until completion
async function monitorTask(taskId, intervalMs = 1000) {
  console.log(`Monitoring task ${taskId}...`);
  
  while (true) {
    const status = await checkTaskStatus(taskId);
    
    if (status.status === 'completed') {
      console.log('Task completed successfully!');
      console.log('Result:', status.result);
      break;
    } else if (status.status === 'failed') {
      console.log('Task failed:', status.error);
      break;
    } else {
      console.log(`Task status: ${status.status}`);
    }
    
    // Wait before checking again
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}

// Example usage demonstration
async function demo() {
  console.log('=== PDF Queue Management Demo ===\n');
  
  // 1. Get initial queue stats
  console.log('1. Initial queue stats:');
  await getQueueStats();
  console.log('');
  
  // 2. Upload a PDF (you'll need to provide a real PDF file path)
  // const taskId = await uploadPDF('./sample.pdf');
  // 
  // if (taskId) {
  //   // 3. Monitor the task
  //   await monitorTask(taskId);
  // }
  
  // 4. Get all tasks
  console.log('2. All tasks status:');
  await getAllTasksStatus();
  console.log('');
  
  // 5. Get final queue stats
  console.log('3. Final queue stats:');
  await getQueueStats();
}

// Uncomment to run the demo
// demo().catch(console.error);

module.exports = {
  uploadPDF,
  checkTaskStatus,
  getAllTasksStatus,
  getQueueStats,
  pauseQueue,
  resumeQueue,
  setConcurrency,
  monitorTask
}; 