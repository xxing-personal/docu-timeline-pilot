
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FileText, Calendar, Clock, ChevronDown, ChevronRight } from 'lucide-react';

interface AnalysisTabProps {
  uploadedFiles: File[];
}

interface TimelineEvent {
  id: string;
  documentName: string;
  time: string;
  title: string;
  summary: string;
  details: string;
  color: string;
  type: 'positive' | 'neutral' | 'negative';
}

const AnalysisTab = ({ uploadedFiles }: AnalysisTabProps) => {
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  // Mock timeline events based on uploaded files
  const generateTimelineEvents = (): TimelineEvent[] => {
    const events: TimelineEvent[] = [];
    
    uploadedFiles.forEach((file, index) => {
      const baseTime = new Date();
      baseTime.setHours(9 + index * 2, 0, 0, 0);
      
      events.push({
        id: `event-${index}`,
        documentName: file.name,
        time: baseTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        title: `Key Insight from ${file.name.split('.')[0]}`,
        summary: `Significant tone shift detected in document analysis`,
        details: `This document shows a notable change from formal to conversational tone around page 3. The language becomes more engaging and direct, suggesting a shift in intended audience or communication strategy. Key phrases include "let's explore", "you might wonder", and "here's what matters most". This change correlates with improved readability scores and may indicate better user engagement potential.`,
        color: index % 3 === 0 ? 'bg-blue-500' : index % 3 === 1 ? 'bg-green-500' : 'bg-orange-500',
        type: index % 3 === 0 ? 'positive' : index % 3 === 1 ? 'neutral' : 'negative'
      });
    });

    // Add a few more sample events if we have files
    if (uploadedFiles.length > 0) {
      const sampleEvents = [
        {
          id: 'sample-1',
          documentName: 'Analysis Summary',
          time: '2:30 PM',
          title: 'Cross-document Pattern Analysis',
          summary: 'Recurring themes identified across documents',
          details: 'Analysis reveals consistent patterns in technical terminology usage, suggesting documents are part of a coordinated communication strategy. Common themes include emphasis on innovation, customer-centric language, and future-focused messaging.',
          color: 'bg-purple-500',
          type: 'positive' as const
        },
        {
          id: 'sample-2',
          documentName: 'Sentiment Analysis',
          time: '3:45 PM',
          title: 'Emotional Tone Variations',
          summary: 'Notable sentiment changes detected',
          details: 'Sentiment analysis shows a progression from cautious optimism in early documents to confident assertion in later materials. This evolution suggests growing confidence in the subject matter or audience familiarity.',
          color: 'bg-teal-500',
          type: 'neutral' as const
        }
      ];
      events.push(...sampleEvents);
    }

    return events;
  };

  const timelineEvents = generateTimelineEvents();

  const toggleEventExpansion = (eventId: string) => {
    const newExpanded = new Set(expandedEvents);
    if (newExpanded.has(eventId)) {
      newExpanded.delete(eventId);
    } else {
      newExpanded.add(eventId);
    }
    setExpandedEvents(newExpanded);
  };

  if (uploadedFiles.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <Timeline className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">No Documents for Analysis</h3>
          <p className="text-sm text-slate-500">
            Upload PDF documents to see event timeline analysis with document insights and tone changes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-2 h-8 bg-gradient-to-b from-blue-500 to-purple-500 rounded-full"></div>
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Document Analysis Timeline</h3>
            <p className="text-sm text-slate-600">{timelineEvents.length} insights discovered</p>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6">
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gradient-to-b from-slate-300 via-slate-200 to-slate-100"></div>
            
            {/* Timeline events */}
            <div className="space-y-6">
              {timelineEvents.map((event, index) => (
                <div key={event.id} className="relative">
                  {/* Timeline dot */}
                  <div className={`absolute left-6 w-4 h-4 rounded-full ${event.color} border-4 border-white shadow-lg z-10`}></div>
                  
                  {/* Event card */}
                  <div className="ml-16">
                    <Card className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                              <Clock className="w-3 h-3" />
                              {event.time}
                              <span className="mx-1">•</span>
                              <FileText className="w-3 h-3" />
                              {event.documentName}
                            </div>
                            <CardTitle className="text-base text-slate-800">{event.title}</CardTitle>
                            <p className="text-sm text-slate-600 mt-1">{event.summary}</p>
                          </div>
                          <Collapsible>
                            <CollapsibleTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleEventExpansion(event.id)}
                                className="p-1 h-auto"
                              >
                                {expandedEvents.has(event.id) ? (
                                  <ChevronDown className="w-4 h-4" />
                                ) : (
                                  <ChevronRight className="w-4 h-4" />
                                )}
                              </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <CardContent className="pt-3 pl-0 pr-0 pb-0">
                                <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-700 leading-relaxed">
                                  {event.details}
                                </div>
                              </CardContent>
                            </CollapsibleContent>
                          </Collapsible>
                        </div>
                      </CardHeader>
                    </Card>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};

export default AnalysisTab;
