import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  FileText, 
  Image, 
  Database, 
  BarChart3, 
  ExternalLink, 
  Download, 
  Eye, 
  Star,
  Clock,
  User,
  Tag,
  TrendingUp
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Types for search results
export interface SearchResult {
  id: string;
  title: string;
  description: string;
  type: 'document' | 'image' | 'data' | 'analysis';
  category: string;
  url?: string;
  thumbnail?: string;
  author?: string;
  createdAt: string;
  updatedAt?: string;
  size?: string;
  tags: string[];
  relevanceScore: number;
  semanticScore?: number;
  highlights?: string[];
  metadata?: Record<string, any>;
  isFavorite?: boolean;
  viewCount?: number;
  downloadCount?: number;
}

interface SearchResultCardProps {
  result: SearchResult;
  viewMode?: 'card' | 'list' | 'compact';
  onView?: (result: SearchResult) => void;
  onDownload?: (result: SearchResult) => void;
  onFavorite?: (result: SearchResult) => void;
  onTagClick?: (tag: string) => void;
  className?: string;
}

const typeIcons = {
  document: FileText,
  image: Image,
  data: Database,
  analysis: BarChart3,
};

const typeColors = {
  document: 'bg-blue-100 text-blue-800 border-blue-200',
  image: 'bg-green-100 text-green-800 border-green-200',
  data: 'bg-purple-100 text-purple-800 border-purple-200',
  analysis: 'bg-orange-100 text-orange-800 border-orange-200',
};

export const SearchResultCard: React.FC<SearchResultCardProps> = ({
  result,
  viewMode = 'card',
  onView,
  onDownload,
  onFavorite,
  onTagClick,
  className,
}) => {
  const TypeIcon = typeIcons[result.type];
  
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatScore = (score: number) => {
    return Math.round(score * 100);
  };

  const handleView = () => {
    onView?.(result);
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDownload?.(result);
  };

  const handleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFavorite?.(result);
  };

  const handleTagClick = (e: React.MouseEvent, tag: string) => {
    e.stopPropagation();
    onTagClick?.(tag);
  };

  // Compact view for dense listings
  if (viewMode === 'compact') {
    return (
      <div
        className={cn(
          'flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors',
          className
        )}
        onClick={handleView}
      >
        <div className="flex-shrink-0">
          <TypeIcon className="h-4 w-4 text-gray-500" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-gray-900 truncate">
              {result.title}
            </h4>
            <Badge variant="outline" className={cn('text-xs', typeColors[result.type])}>
              {result.type}
            </Badge>
          </div>
          <p className="text-xs text-gray-500 truncate mt-1">
            {result.description}
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{formatScore(result.relevanceScore)}%</span>
          {result.isFavorite && (
            <Star className="h-3 w-3 text-yellow-500 fill-current" />
          )}
        </div>
      </div>
    );
  }

  // List view for detailed listings
  if (viewMode === 'list') {
    return (
      <div
        className={cn(
          'flex gap-4 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors',
          className
        )}
        onClick={handleView}
      >
        {/* Thumbnail or Icon */}
        <div className="flex-shrink-0">
          {result.thumbnail ? (
            <img
              src={result.thumbnail}
              alt={result.title}
              className="w-16 h-16 object-cover rounded-lg border"
            />
          ) : (
            <div className="w-16 h-16 bg-gray-100 rounded-lg border flex items-center justify-center">
              <TypeIcon className="h-8 w-8 text-gray-400" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold text-gray-900 truncate">
                  {result.title}
                </h3>
                <Badge variant="outline" className={cn('text-xs', typeColors[result.type])}>
                  {result.type}
                </Badge>
                {result.isFavorite && (
                  <Star className="h-4 w-4 text-yellow-500 fill-current" />
                )}
              </div>
              
              <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                {result.description}
              </p>

              {/* Highlights */}
              {result.highlights && result.highlights.length > 0 && (
                <div className="mb-2">
                  {result.highlights.slice(0, 2).map((highlight, index) => (
                    <p key={index} className="text-xs text-gray-500 italic">
                      "...{highlight}..."
                    </p>
                  ))}
                </div>
              )}

              {/* Tags */}
              {result.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {result.tags.slice(0, 4).map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="text-xs cursor-pointer hover:bg-gray-200"
                      onClick={(e) => handleTagClick(e, tag)}
                    >
                      <Tag className="h-3 w-3 mr-1" />
                      {tag}
                    </Badge>
                  ))}
                  {result.tags.length > 4 && (
                    <Badge variant="secondary" className="text-xs">
                      +{result.tags.length - 4} more
                    </Badge>
                  )}
                </div>
              )}

              {/* Metadata */}
              <div className="flex items-center gap-4 text-xs text-gray-500">
                {result.author && (
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    <span>{result.author}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>{formatDate(result.createdAt)}</span>
                </div>
                {result.size && (
                  <span>{result.size}</span>
                )}
                {result.viewCount && (
                  <div className="flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    <span>{result.viewCount}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Scores and Actions */}
            <div className="flex flex-col items-end gap-2">
              <div className="text-right">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <div className="text-sm font-medium text-gray-900">
                        {formatScore(result.relevanceScore)}%
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Relevance Score</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                
                {result.semanticScore && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <div className="text-xs text-gray-500 flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" />
                          {formatScore(result.semanticScore)}%
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Semantic Score</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>

              <div className="flex gap-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleFavorite}
                        className="h-8 w-8 p-0"
                      >
                        <Star className={cn(
                          'h-4 w-4',
                          result.isFavorite ? 'text-yellow-500 fill-current' : 'text-gray-400'
                        )} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{result.isFavorite ? 'Remove from favorites' : 'Add to favorites'}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {onDownload && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleDownload}
                          className="h-8 w-8 p-0"
                        >
                          <Download className="h-4 w-4 text-gray-400" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Download</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}

                {result.url && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(result.url, '_blank');
                          }}
                          className="h-8 w-8 p-0"
                        >
                          <ExternalLink className="h-4 w-4 text-gray-400" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Open in new tab</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Card view (default)
  return (
    <Card
      className={cn(
        'cursor-pointer hover:shadow-md transition-shadow',
        className
      )}
      onClick={handleView}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {result.thumbnail ? (
              <img
                src={result.thumbnail}
                alt={result.title}
                className="w-12 h-12 object-cover rounded-lg border flex-shrink-0"
              />
            ) : (
              <div className="w-12 h-12 bg-gray-100 rounded-lg border flex items-center justify-center flex-shrink-0">
                <TypeIcon className="h-6 w-6 text-gray-400" />
              </div>
            )}
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-gray-900 truncate">
                  {result.title}
                </h3>
                {result.isFavorite && (
                  <Star className="h-4 w-4 text-yellow-500 fill-current flex-shrink-0" />
                )}
              </div>
              <Badge variant="outline" className={cn('text-xs', typeColors[result.type])}>
                {result.type}
              </Badge>
            </div>
          </div>

          <div className="text-right flex-shrink-0">
            <div className="text-sm font-medium text-gray-900">
              {formatScore(result.relevanceScore)}%
            </div>
            {result.semanticScore && (
              <div className="text-xs text-gray-500 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {formatScore(result.semanticScore)}%
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <p className="text-sm text-gray-600 line-clamp-3 mb-3">
          {result.description}
        </p>

        {/* Highlights */}
        {result.highlights && result.highlights.length > 0 && (
          <div className="mb-3">
            {result.highlights.slice(0, 2).map((highlight, index) => (
              <p key={index} className="text-xs text-gray-500 italic mb-1">
                "...{highlight}..."
              </p>
            ))}
          </div>
        )}

        {/* Tags */}
        {result.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {result.tags.slice(0, 3).map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-xs cursor-pointer hover:bg-gray-200"
                onClick={(e) => handleTagClick(e, tag)}
              >
                <Tag className="h-3 w-3 mr-1" />
                {tag}
              </Badge>
            ))}
            {result.tags.length > 3 && (
              <Badge variant="secondary" className="text-xs">
                +{result.tags.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Metadata and Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {result.author && (
              <div className="flex items-center gap-1">
                <User className="h-3 w-3" />
                <span>{result.author}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{formatDate(result.createdAt)}</span>
            </div>
            {result.size && <span>{result.size}</span>}
          </div>

          <div className="flex gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleFavorite}
                    className="h-8 w-8 p-0"
                  >
                    <Star className={cn(
                      'h-4 w-4',
                      result.isFavorite ? 'text-yellow-500 fill-current' : 'text-gray-400'
                    )} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{result.isFavorite ? 'Remove from favorites' : 'Add to favorites'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {onDownload && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDownload}
                      className="h-8 w-8 p-0"
                    >
                      <Download className="h-4 w-4 text-gray-400" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Download</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {result.url && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(result.url, '_blank');
                      }}
                      className="h-8 w-8 p-0"
                    >
                      <ExternalLink className="h-4 w-4 text-gray-400" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Open in new tab</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SearchResultCard;