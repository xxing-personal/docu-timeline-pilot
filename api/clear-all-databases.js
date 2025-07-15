const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');

const filesToReset = [
  {
    filename: 'database.json',
    empty: {
      tasks: [],
      settings: {
        lastBackup: new Date().toISOString(),
        version: '1.0.0'
      },
      statistics: {
        totalProcessed: 0,
        totalFailed: 0,
        lastProcessedDate: new Date().toISOString()
      }
    }
  },
  {
    filename: 'chat-database.json',
    empty: {
      messages: [],
      sessions: [],
      settings: {
        lastBackup: new Date().toISOString(),
        version: '1.0.0'
      },
      statistics: {
        totalMessages: 0,
        totalSessions: 0,
        lastMessageDate: new Date().toISOString()
      }
    }
  },
  {
    filename: 'agent-queues.json',
    empty: {
      queues: {}
    }
  }
];

console.log('🗑️ Resetting main database files...');

for (const { filename, empty } of filesToReset) {
  const filePath = path.join(dataDir, filename);
  try {
    fs.writeFileSync(filePath, JSON.stringify(empty, null, 2));
    console.log(`✅ Reset: ${filename}`);
  } catch (err) {
    console.error(`❌ Failed to reset: ${filename}`, err);
  }
}

console.log('\n🎉 All main database files have been reset!');
console.log('\nSummary:');
for (const { filename } of filesToReset) {
  console.log(`   • ${filename} reset to empty state`);
}
