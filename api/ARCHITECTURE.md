# Improved PDF Queue Management Architecture

## Overview

The PDF queue management system has been restructured to follow better software engineering practices, including separation of concerns, dependency injection, and cleaner abstractions.

## Architecture Diagram

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Express App   │────│   Container     │────│   Services      │
│   (HTTP Layer)  │    │ (DI Container)  │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ├── PDFQueueService
                                ├── PDFProcessor  
                                └── TaskRepository
                                        │
                                        ▼
                                ┌─────────────────┐
                                │   LowDB         │
                                │ (JSON Storage)  │
                                └─────────────────┘
```

## Key Improvements

### 1. **Separation of Concerns**

**Before**: Single `PDFQueueService` handled everything
**After**: Clear separation of responsibilities

- **`TaskRepository`**: Data persistence and CRUD operations
- **`PDFProcessor`**: PDF processing logic and validation
- **`PDFQueueService`**: Queue management and orchestration
- **`Container`**: Dependency injection and service wiring

### 2. **Eliminated Circular Dependencies**

**Before**: 
```typescript
// database.ts
import { PDFTask } from './pdfQueueService';

// pdfQueueService.ts  
import { database } from './database';
```

**After**:
```typescript
// types.ts - Shared interfaces
export interface PDFTask { ... }

// All services import from types.ts
// No circular dependencies
```

### 3. **Dependency Injection**

**Before**: Hard-coded singleton dependencies
```typescript
// Hard to test, tightly coupled
export const database = new DatabaseService();
```

**After**: Constructor injection with container
```typescript
export class PDFQueueService {
  constructor(
    private taskRepository: TaskRepository,
    private pdfProcessor: PDFProcessor,
    concurrency: number = 1
  ) { ... }
}
```

### 4. **Better Error Handling**

- PDF validation before queue addition
- Proper error propagation
- File cleanup on upload failures
- Comprehensive error responses

### 5. **Enhanced API Design**

- Health check endpoint
- Individual task deletion
- Better queue status information
- Improved error responses

## File Structure

```
api/src/
├── types.ts                    # Shared interfaces and types
├── container.ts               # Dependency injection container
├── repositories/
│   └── taskRepository.ts      # Data access layer
├── services/
│   ├── pdfProcessor.ts        # PDF processing logic
│   └── pdfQueueService.ts     # Queue management
└── app.ts                     # Express application
```

## Benefits of New Architecture

### 1. **Testability**
- Easy to mock dependencies
- Isolated unit testing
- Test containers for integration tests

### 2. **Maintainability**
- Clear separation of concerns
- Single responsibility principle
- Easy to modify individual components

### 3. **Extensibility**
- Easy to add new processors
- Pluggable repository implementations
- Support for different storage backends

### 4. **Performance**
- Better error handling reduces resource leaks
- Validation before processing
- Optimized database operations

## Usage Examples

### Basic Usage
```typescript
const container = Container.getInstance();
await container.init();
const queueService = container.getPDFQueueService();

const taskId = await queueService.addTask('document.pdf', '/path/to/file');
```

### Testing
```typescript
const mockRepository = new MockTaskRepository();
const mockProcessor = new MockPDFProcessor();
const container = Container.createTestContainer(mockRepository, mockProcessor);
```

### Custom Configuration
```typescript
const repository = new TaskRepository('custom-db.json');
const processor = new PDFProcessor();
const queueService = new PDFQueueService(repository, processor, 3);
```

## Migration from Old Architecture

The old files (`database.ts` and `pdfQueueService.ts`) can be safely removed after testing the new implementation:

1. **Test the new implementation thoroughly**
2. **Verify all existing functionality works**
3. **Remove old files**:
   - `src/database.ts`
   - `src/pdfQueueService.ts` (old version)

## Future Enhancements

1. **Multiple Queue Types**: Support different processing queues
2. **Redis Backend**: For distributed systems
3. **Metrics Collection**: Detailed performance monitoring
4. **Rate Limiting**: Per-user or global rate limits
5. **Webhook Support**: Notify external systems on completion
6. **Batch Processing**: Process multiple files together

## Configuration Options

The new architecture supports various configuration options:

```typescript
// Different database files
new TaskRepository('production.json')

// Custom concurrency
new PDFQueueService(repo, processor, 5)

// Test environment
Container.createTestContainer(mockRepo, mockProcessor)
```

This improved architecture provides a solid foundation for scaling the PDF processing system while maintaining code quality and testability. 