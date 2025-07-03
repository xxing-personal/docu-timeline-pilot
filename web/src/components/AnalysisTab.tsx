import React, { useEffect, useState, useRef } from 'react';
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { getApiBaseUrl } from "@/lib/utils";
import { Trash } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface IndexEntry {
  id: string;
  indexName: string;
  scoreValue: number;
  articleId: string;
  filename: string;
  source: 'pdf_processing' | 'indices_creation';
  evidence: string[];
  rational: string;
  createdAt: string;
  timestamp?: string;
  taskId?: string;
}

const API_BASE_URL = getApiBaseUrl();

const AnalysisTab = () => {
  const [indices, setIndices] = useState<IndexEntry[]>([]);
  const [indexNames, setIndexNames] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState<string | null>(null);
  const hasInitialized = useRef(false); // Track if we've set initial tab
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  // Delete an index by id
  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this index?')) return;
    setDeletingId(id);
    try {
      const response = await fetch(`${API_BASE_URL}/indices/${id}`, { method: 'DELETE' });
      if (response.ok) {
        await fetchIndices();
      } else {
        alert('Failed to delete index.');
      }
    } catch (error) {
      alert('Error deleting index.');
    } finally {
      setDeletingId(null);
    }
  };

  // Prepare chart data for the active index
  const getChartData = (indexName: string) => {
    // Only include indices with the specified name
    const filtered = indices.filter(index => index.indexName === indexName);
    // Sort by timestamp or createdAt
    filtered.sort((a, b) => {
      const aTime = new Date(a.timestamp || a.createdAt).getTime();
      const bTime = new Date(b.timestamp || b.createdAt).getTime();
      return aTime - bTime;
    });
    return {
      labels: filtered.map(index => new Date(index.timestamp || index.createdAt).toLocaleDateString()),
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
                    const aTime = new Date(a.timestamp || a.createdAt).getTime();
                    const bTime = new Date(b.timestamp || b.createdAt).getTime();
                    return aTime - bTime;
                  })
                  .map(index => (
                  <Card key={index.id} className="p-4 flex flex-col gap-2 relative group">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">
                        {index.source.replace('_', ' ')}
                      </Badge>
                      <span className="font-medium text-slate-900 truncate">{index.filename}</span>
                      <button
                        className="ml-auto text-slate-400 hover:text-red-600 transition-colors p-1 rounded group-hover:bg-slate-100 disabled:opacity-50"
                        title="Delete index"
                        onClick={() => handleDelete(index.id)}
                        disabled={deletingId === index.id}
                      >
                        <Trash className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="text-xs text-slate-500">
                      Date: {new Date(index.timestamp || index.createdAt).toLocaleString()}
                    </div>
                    <div className="text-sm">
                      <span className="font-medium">{name.replace(/_/g, ' ')}:</span> {(index.scoreValue * 100).toFixed(0)}%
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
