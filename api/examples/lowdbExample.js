// Simple lowdb example for PDF processing state management
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const path = require('path');

// Simple example matching your requested format
async function simpleExample() {
  console.log('=== Simple lowdb Example ===\n');
  
  // Initialize database
  const adapter = new JSONFile(path.resolve(__dirname, '../simple_documents.json'));
  const db = new Low(adapter, { documents: [] });
  
  await db.read();
  db.data ||= { documents: [] };
  
  // Add a document
  const id = `pdf_${Date.now()}`;
  const filename = 'sample.pdf';
  
  db.data.documents.push({ 
    id, 
    filename, 
    status: 'pending',
    createdAt: new Date().toISOString()
  });
  
  await db.write();
  console.log('Added document:', { id, filename, status: 'pending' });
  
  // Update status
  const document = db.data.documents.find(doc => doc.id === id);
  if (document) {
    document.status = 'processing';
    document.startedAt = new Date().toISOString();
    await db.write();
    console.log('Updated document status to processing');
  }
  
  // Simulate processing completion
  setTimeout(async () => {
    await db.read();
    const doc = db.data.documents.find(d => d.id === id);
    if (doc) {
      doc.status = 'completed';
      doc.completedAt = new Date().toISOString();
      doc.result = {
        extractedText: 'Sample text from PDF',
        pageCount: 5
      };
      await db.write();
      console.log('Processing completed:', doc);
    }
  }, 2000);
  
  // Show all documents
  console.log('All documents:', db.data.documents);
}

// Advanced example with queue-like behavior
async function queueExample() {
  console.log('\n=== Queue-like lowdb Example ===\n');
  
  const adapter = new JSONFile(path.resolve(__dirname, '../queue_documents.json'));
  const db = new Low(adapter, { 
    documents: [],
    settings: { concurrency: 1 }
  });
  
  await db.read();
  db.data ||= { 
    documents: [],
    settings: { concurrency: 1 }
  };
  
  // Queue management functions
  const addToQueue = async (filename) => {
    const task = {
      id: `pdf_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      filename,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    db.data.documents.push(task);
    await db.write();
    console.log(`Added to queue: ${filename} (${task.id})`);
    return task.id;
  };
  
  const processNext = async () => {
    await db.read();
    const pendingTask = db.data.documents.find(doc => doc.status === 'pending');
    
    if (!pendingTask) {
      console.log('No pending tasks');
      return;
    }
    
    // Update to processing
    pendingTask.status = 'processing';
    pendingTask.startedAt = new Date().toISOString();
    await db.write();
    console.log(`Processing: ${pendingTask.filename}`);
    
    // Simulate processing
    setTimeout(async () => {
      await db.read();
      const task = db.data.documents.find(doc => doc.id === pendingTask.id);
      if (task) {
        task.status = 'completed';
        task.completedAt = new Date().toISOString();
        task.result = {
          extractedText: `Processed content from ${task.filename}`,
          pageCount: Math.floor(Math.random() * 20) + 1
        };
        await db.write();
        console.log(`Completed: ${task.filename}`);
        
        // Process next task
        setTimeout(processNext, 500);
      }
    }, 1000 + Math.random() * 2000); // Random processing time
  };
  
  const getStats = async () => {
    await db.read();
    const tasks = db.data.documents;
    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      processing: tasks.filter(t => t.status === 'processing').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length
    };
  };
  
  // Add some tasks to the queue
  await addToQueue('document1.pdf');
  await addToQueue('document2.pdf');
  await addToQueue('document3.pdf');
  
  // Start processing
  processNext();
  
  // Show stats periodically
  const showStats = async () => {
    const stats = await getStats();
    console.log('Queue stats:', stats);
    
    if (stats.pending > 0 || stats.processing > 0) {
      setTimeout(showStats, 2000);
    } else {
      console.log('\n=== All tasks completed! ===');
      // Show final results
      await db.read();
      console.log('Final documents:', JSON.stringify(db.data.documents, null, 2));
    }
  };
  
  setTimeout(showStats, 1000);
}

// Run examples
async function runExamples() {
  try {
    await simpleExample();
    setTimeout(queueExample, 3000);
  } catch (error) {
    console.error('Example error:', error);
  }
}

// Export for use in other files
module.exports = {
  simpleExample,
  queueExample,
  runExamples
};

// Run if called directly
if (require.main === module) {
  runExamples();
} 