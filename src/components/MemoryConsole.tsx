/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { MemoryEntry, MemoryType } from '../types';
import { Library, Search, Tag, User, Globe, Clock, Sparkles } from 'lucide-react';

interface MemoryConsoleProps {
  memories: MemoryEntry[];
}

export default function MemoryConsole({ memories: initialMemories }: MemoryConsoleProps) {
  const [query, setQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<MemoryType | ''>('');
  const [searchResults, setSearchResults] = useState<MemoryEntry[]>(initialMemories);
  const [isSearching, setIsSearching] = useState<boolean>(false);

  const types: MemoryType[] = [
    'Document',
    'Decision_Record',
    'Meeting_Transcript',
    'Email_Thread',
    'Chat_Message',
    'Customer_Interaction',
    'Workflow_Event',
    'Strategy_Session',
  ];

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSearching(true);

    try {
      const response = await fetch('/api/v1/memories/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query || '*', type: selectedType || undefined }),
      });
      const data = await response.json();
      setSearchResults(data.results || []);
    } catch (err) {
      console.error(err);
      // Fallback local filtering
      let filtered = initialMemories;
      if (selectedType) {
        filtered = filtered.filter((m) => m.type === selectedType);
      }
      if (query.trim()) {
        filtered = filtered.filter((m) => m.text.toLowerCase().includes(query.toLowerCase()));
      }
      setSearchResults(filtered);
    } finally {
      setIsSearching(false);
    }
  };

  // Trigger search on query or filter change
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      handleSearch();
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [query, selectedType, initialMemories]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-white p-6 border border-gray-100/60 rounded-2xl shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-brand-bronze/10 text-brand-bronze rounded-xl">
            <Library className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-base font-sans font-semibold text-gray-900">Organizational Memory</h1>
            <p className="text-xs text-gray-400">Institutional record of all meetings, strategic decisions, emails, and multi-agent chats.</p>
          </div>
        </div>
      </div>

      {/* Query Filter panel */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-4 border border-gray-100 rounded-xl shadow-xs">
        <div className="md:col-span-3 flex items-center space-x-2 bg-gray-50 border border-gray-100 px-3 py-2 rounded-xl focus-within:bg-white focus-within:ring-1 focus-within:ring-black transition-all">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search company mission, qualification criteria, decision archives..."
            className="flex-1 bg-transparent border-none text-xs text-gray-900 focus:outline-none placeholder-gray-400 font-sans"
          />
        </div>

        <div>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as MemoryType | '')}
            className="w-full bg-gray-50 border border-gray-100 px-3 py-2 rounded-xl text-xs text-gray-600 focus:outline-none focus:bg-white focus:ring-1 focus:ring-black cursor-pointer"
          >
            <option value="">All Memory Types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Results Listing */}
      <div className="space-y-4">
        <div className="flex justify-between items-center text-[10px] font-mono text-gray-400 font-bold uppercase tracking-widest px-1">
          <span>Search Results ({searchResults.length})</span>
          {isSearching && <span className="text-brand-bronze animate-pulse">Running semantic indexing...</span>}
        </div>

        {searchResults.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center text-xs text-gray-400 space-y-2">
            <Library className="w-8 h-8 text-gray-200 mx-auto" />
            <p>No memory records found matching your active queries.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {searchResults.map((mem) => (
              <div key={mem.id} className="bg-white border border-gray-100/60 rounded-2xl p-6 shadow-xs hover:shadow-sm transition-all space-y-4">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 bg-brand-bronze/5 border border-brand-bronze/10 rounded text-[9px] font-mono font-bold uppercase text-brand-bronze">
                      {mem.type.replace('_', ' ')}
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono">ID: {mem.id}</span>
                  </div>

                  {/* Semantic match relevance tag */}
                  {mem.relevanceScore !== undefined && (
                    <div className="flex items-center space-x-1 bg-emerald-50 text-emerald-700 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md">
                      <Sparkles className="w-3 h-3 text-emerald-600" />
                      <span>{mem.relevanceScore}% MATCH</span>
                    </div>
                  )}
                </div>

                {/* Content Block */}
                <p className="text-xs text-gray-700 leading-relaxed font-sans whitespace-pre-wrap">
                  {mem.text}
                </p>

                {/* Metadata block */}
                <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2 border-t border-gray-50 text-[10px] font-mono text-gray-400">
                  <span className="flex items-center space-x-1">
                    <User className="w-3.5 h-3.5" />
                    <span>Actor: {mem.actor}</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <Globe className="w-3.5 h-3.5" />
                    <span>Source: {mem.sourceSystem}</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{new Date(mem.createdAt).toLocaleString()}</span>
                  </span>
                  {mem.tags.length > 0 && (
                    <span className="flex items-center space-x-1">
                      <Tag className="w-3.5 h-3.5" />
                      <span className="flex gap-1">
                        {mem.tags.map((tag) => (
                          <span key={tag} className="underline decoration-brand-bronze/30">
                            #{tag}
                          </span>
                        ))}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
