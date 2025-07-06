import { IndicesDatabaseService } from './services/indicesDatabaseService';

async function cleanupEmptyTasks() {
  console.log('Starting cleanup of empty tasks...');
  
  try {
    const indicesDb = new IndicesDatabaseService();
    
    // Get current stats before cleanup
    const statsBefore = await indicesDb.getStatistics();
    console.log('Before cleanup:');
    console.log(`- Total agents: ${statsBefore.totalAgents}`);
    console.log(`- Total tasks: ${statsBefore.totalTasks}`);
    console.log(`- Total indices: ${statsBefore.totalIndices}`);
    
    // Run cleanup
    const result = await indicesDb.cleanupEmptyTasks();
    
    // Get stats after cleanup
    const statsAfter = await indicesDb.getStatistics();
    console.log('\nAfter cleanup:');
    console.log(`- Total agents: ${statsAfter.totalAgents}`);
    console.log(`- Total tasks: ${statsAfter.totalTasks}`);
    console.log(`- Total indices: ${statsAfter.totalIndices}`);
    
    console.log('\nCleanup summary:');
    console.log(`- Removed tasks: ${result.removedTasks}`);
    console.log(`- Removed agents: ${result.removedAgents}`);
    console.log(`- Message: ${result.message}`);
    
    console.log('\nCleanup completed successfully!');
    
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
}

cleanupEmptyTasks(); 