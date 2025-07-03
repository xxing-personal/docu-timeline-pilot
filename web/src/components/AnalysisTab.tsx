import React, { useEffect, useState, useRef } from 'react';
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { getApiBaseUrl } from "@/lib/utils";
import { Trash } from 'lucide-react';
import { Button } from "@/components/ui/button";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface IndexEntry {
  id: string;
  indexName: string;
  scoreValue: number;
  source: 'pdf_processing' | 'indices_creation';
  quotes: string[];
  rational: string;
  taskInfo: {
    id: string;
    type: string;
    filename: string;
    articleId: string;
    status: string;
    createdAt: string;
    timestamp?: string;
  };
  agentInfo: {
    name: string;
    type: string;
    queueKey: string;
    createdAt: string;
    status: string;
  };
}

const API_BASE_URL = getApiBaseUrl();

const AnalysisTab = () => {
  const [indices, setIndices] = useState<IndexEntry[]>([]);
  const [indexNames, setIndexNames] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState<string | null>(null);
  const hasInitialized = useRef(false); // Track if we've set initial tab
  const [deletingSeries, setDeletingSeries] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    fetchIndices(); // Initial load
    const interval = setInterval(() => {
      if (isMounted) fetchIndices(false); // Auto-refresh every 5 seconds silently
    }, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const fetchIndices = async (showLoading = true) => {
    try {
      const response = await fetch(`${API_BASE_URL}/indices`);
      if (response.ok) {
        const data = await response.json();
        if (!document.hidden) { // Only set state if tab is visible
          setIndices(data);
          // Collect all unique index names
          const uniqueScores = Array.from(new Set(data.map((index: IndexEntry) => index.indexName))) as string[];
          setIndexNames(uniqueScores);
          
          // Only set default tab on initial load, not on every refresh
          if (uniqueScores.length > 0 && !activeIndex && !hasInitialized.current) {
            setActiveIndex(uniqueScores[0] as string);
            hasInitialized.current = true;
          }
        }
      }
    } catch (error) {
      console.error('Error fetching indices:', error);
    }
  };

  // Delete an entire series by index name
  const handleDeleteSeries = async (indexName: string) => {
    if (!window.confirm(`Are you sure you want to delete the entire "${indexName.replace(/_/g, ' ')}" series? This will delete all data points for this index.`)) return;
    setDeletingSeries(indexName);
    try {
      // Get all indices with this indexName
      const indicesToDelete = indices.filter(index => index.indexName === indexName);
      
      // Delete all indices with this indexName
      const deletePromises = indicesToDelete.map(index => 
        fetch(`${API_BASE_URL}/indices/${index.id}`, { method: 'DELETE' })
      );
      
      const responses = await Promise.all(deletePromises);
      const allSuccessful = responses.every(response => response.ok);
      
      if (allSuccessful) {
        await fetchIndices();
        // If we deleted the active tab, switch to the first remaining tab
        if (activeIndex === indexName) {
          const remainingNames = indexNames.filter(name => name !== indexName);
          setActiveIndex(remainingNames.length > 0 ? remainingNames[0] : null);
        }
      } else {
        alert('Failed to delete some indices in the series.');
      }
    } catch (error) {
      alert('Error deleting series.');
    } finally {
      setDeletingSeries(null);
    }
  };

  // Prepare chart data for the active index
  const getChartData = (indexName: string) => {
    // Only include indices with the specified name
    const filtered = indices.filter(index => index.indexName === indexName);
    // Sort by timestamp or createdAt
    filtered.sort((a, b) => {
      const aTime = new Date(a.taskInfo.timestamp || a.taskInfo.createdAt).getTime();
      const bTime = new Date(b.taskInfo.timestamp || b.taskInfo.createdAt).getTime();
      return aTime - bTime;
    });
    return {
      labels: filtered.map(index => new Date(index.taskInfo.timestamp || index.taskInfo.createdAt).toLocaleDateString()),
      datasets: [
        {
          label: indexName.charAt(0).toUpperCase() + indexName.slice(1),
          data: filtered.map(index => index.scoreValue),
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99,102,241,0.1)',
          tension: 0.3,
          pointRadius: 5,
          pointHoverRadius: 7,
        }
      ]
    };
  };

  return (
    <div className="p-6">
      <h3 className="text-lg font-semibold text-slate-800 mb-4">Analysis Time Series</h3>
      {indexNames.length === 0 ? (
        <div className="text-slate-500">No indices found. Upload PDFs or start an Indices Creation agent to generate analysis scores.</div>
      ) : (
        <Tabs value={activeIndex || undefined} onValueChange={setActiveIndex} className="w-full">
          <TabsList className="mb-4">
            {indexNames.map(name => (
              <TabsTrigger key={name} value={name} className="capitalize">
                {name.replace(/_/g, ' ')}
              </TabsTrigger>
            ))}
          </TabsList>
          {indexNames.map(name => (
            <TabsContent key={name} value={name} className="space-y-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-medium capitalize">{name.replace(/_/g, ' ')} Series</h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDeleteSeries(name)}
                  disabled={deletingSeries === name}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                >
                  <Trash className="w-4 h-4 mr-2" />
                  {deletingSeries === name ? 'Deleting...' : 'Delete Series'}
                </Button>
              </div>
              <div className="bg-white rounded-lg shadow p-4 max-h-[400px]">
                <Line
                  data={getChartData(name)}
                  options={{
                    responsive: true,
                    plugins: {
                      legend: { display: false },
                      title: { display: false },
                      tooltip: { enabled: true }
                    },
                    scales: {
                      y: { 
                        min: -1, 
                        max: 1, 
                        title: { display: true, text: 'Score' } 
                      },
                      x: { title: { display: true, text: 'Date' } }
                    }
                  }}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {indices.filter(index => index.indexName === name)
                  .sort((a, b) => {
                    const aTime = new Date(a.taskInfo.timestamp || a.taskInfo.createdAt).getTime();
                    const bTime = new Date(b.taskInfo.timestamp || b.taskInfo.createdAt).getTime();
                    return aTime - bTime;
                  })
                  .map(index => (
                  <Card key={index.id} className="p-4 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">
                        {index.source.replace('_', ' ')}
                      </Badge>
                      <span className="font-medium text-slate-900 truncate">{index.taskInfo.filename}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      Date: {new Date(index.taskInfo.timestamp || index.taskInfo.createdAt).toLocaleString()}
                    </div>
                    <div className="text-sm">
                      <span className="font-medium">{name.replace(/_/g, ' ')}:</span> {(index.scoreValue * 100).toFixed(0)}%
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      Agent: {index.agentInfo.name} • Task: {index.taskInfo.type}
                    </div>
                  </Card>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
};

export default AnalysisTab;
