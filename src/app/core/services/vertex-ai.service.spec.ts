import { TestBed } from '@angular/core/testing';
import { VertexAiService } from './vertex-ai.service';
import { Functions } from '@angular/fire/functions';

describe('VertexAiService', () => {
  let service: VertexAiService;

  const mockFunctions = {};

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [VertexAiService, { provide: Functions, useValue: mockFunctions }],
    });
    service = TestBed.inject(VertexAiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize with loading states as false', () => {
    expect(service.loading()).toBe(false);
    expect(service.generatingSubtasks()).toBe(false);
    expect(service.suggestingPriority()).toBe(false);
    expect(service.suggestingDueDate()).toBe(false);
    expect(service.enhancingDescription()).toBe(false);
    expect(service.error()).toBeNull();
  });
});
