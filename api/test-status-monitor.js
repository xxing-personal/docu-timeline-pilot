const API_BASE_URL = 'http://localhost:3000';

async function monitorTaskStatus() {
  try {
    console.log('Monitoring all task statuses...\n');
    
    for (let i = 0; i < 60; i++) { // Monitor for 60 seconds
      try {
        const response = await fetch(`${API_BASE_URL}/status`);
        if (response.ok) {
          const data = await response.json();
          const timestamp = new Date().toLocaleTimeString();
          
          // Show status of each task
          console.log(`[${timestamp}] Task Status:`);
          data.tasks.forEach(task => {
            const status = task.status.toUpperCase().padEnd(10);
            const filename = task.filename.substring(0, 30);
            console.log(`  ${status} | ${filename} | ID: ${task.id.substring(0, 20)}...`);
          });
          
          // Show queue stats
          console.log(`  Queue: ${data.queueStats.working} working, ${data.queueStats.length} pending\n`);
          
          // Check if there are processing tasks
          const processingTasks = data.tasks.filter(t => t.status === 'processing');
          if (processingTasks.length > 0) {
            console.log(`🔄 PROCESSING DETECTED: ${processingTasks.length} task(s)`);
            processingTasks.forEach(task => {
              console.log(`   - ${task.filename} (${task.id})`);
            });
            console.log('');
          }
          
        }
      } catch (error) {
        console.error('Status check error:', error.message);
      }
      
      // Wait 500ms between checks for more frequent monitoring
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
  } catch (error) {
    console.error('Monitor error:', error);
  }
}

// Run the monitor
monitorTaskStatus(); 