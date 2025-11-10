/**
 * ConversationList - Middle panel showing chat groups and conversations
 * Teams-style conversation list with groups and direct messages
 */

import React from 'react';
import {
  Search,
  Filter,
  MoreHorizontal,
  Hash,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

interface ConversationGroup {
  id: string;
  name: string;
  unreadCount: number;
}

interface DirectMessage {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  timestamp: string;
  unreadCount: number;
  isOnline: boolean;
}

interface ConversationListProps {
  selectedConversationId: string | null;
  onSelectConversation: (id: string) => void;
  groups?: ConversationGroup[];
  directMessages?: DirectMessage[];
}

export const ConversationList: React.FC<ConversationListProps> = ({
  selectedConversationId,
  onSelectConversation,
  groups = [],
  directMessages = [],
}) => {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [showGroups, setShowGroups] = React.useState(true);
  const [showDirectMessages, setShowDirectMessages] = React.useState(true);

  // Default groups for Agent Hub
  const defaultGroups: ConversationGroup[] = [
    { id: 'search-agent', name: 'Search Agent', unreadCount: 0 },
    { id: 'research-agent', name: 'Research Agent', unreadCount: 0 },
    { id: 'analytics-agent', name: 'Analytics Agent', unreadCount: 0 },
    { id: 'business-agent', name: 'Business Agent', unreadCount: 0 },
  ];

  const displayGroups = groups.length > 0 ? groups : defaultGroups;

  return (
    <div className="w-80 border-r bg-card flex flex-col h-screen">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Chats</h2>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Filter className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search"
            className="pl-10 h-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="all" className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0 h-auto">
          <TabsTrigger
            value="all"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            All
          </TabsTrigger>
          <TabsTrigger
            value="archived"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            Archived
          </TabsTrigger>
          <TabsTrigger
            value="mentions"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            Mentions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="flex-1 m-0">
          <ScrollArea className="h-full">
            {/* Support Groups Section */}
            <div className="p-2">
              <button
                onClick={() => setShowGroups(!showGroups)}
                className="flex items-center gap-2 w-full px-2 py-1 hover:bg-accent rounded text-sm font-medium"
              >
                {showGroups ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <span>Agent Groups</span>
              </button>

              {showGroups && (
                <div className="mt-1 space-y-1">
                  {displayGroups.map((group) => (
                    <button
                      key={group.id}
                      onClick={() => onSelectConversation(group.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                        selectedConversationId === group.id
                          ? 'bg-primary/10 border-l-2 border-primary'
                          : 'hover:bg-accent'
                      }`}
                    >
                      <Hash className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 text-left min-w-0">
                        <div className="font-medium text-sm truncate">
                          {group.name}
                        </div>
                      </div>
                      {group.unreadCount > 0 && (
                        <Badge
                          variant="default"
                          className="h-5 min-w-[20px] flex items-center justify-center px-1.5 bg-primary text-primary-foreground"
                        >
                          {group.unreadCount}
                        </Badge>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Direct Messages Section */}
            {directMessages.length > 0 && (
              <div className="p-2 mt-2">
                <button
                  onClick={() => setShowDirectMessages(!showDirectMessages)}
                  className="flex items-center gap-2 w-full px-2 py-1 hover:bg-accent rounded text-sm font-medium"
                >
                  {showDirectMessages ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <span>Direct Message</span>
                </button>

                {showDirectMessages && (
                  <div className="mt-1 space-y-1">
                    {directMessages.map((dm) => (
                      <button
                        key={dm.id}
                        onClick={() => onSelectConversation(dm.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                          selectedConversationId === dm.id
                            ? 'bg-primary/10 border-l-2 border-primary'
                            : 'hover:bg-accent'
                        }`}
                      >
                        <div className="relative flex-shrink-0">
                          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                            <span className="text-xs font-medium">
                              {dm.name.substring(0, 2).toUpperCase()}
                            </span>
                          </div>
                          {dm.isOnline && (
                            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-card" />
                          )}
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <div className="font-medium text-sm truncate">
                            {dm.name}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {dm.lastMessage}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-xs text-muted-foreground">
                            {dm.timestamp}
                          </span>
                          {dm.unreadCount > 0 && (
                            <Badge
                              variant="default"
                              className="h-5 min-w-[20px] flex items-center justify-center px-1.5 bg-primary text-primary-foreground"
                            >
                              {dm.unreadCount}
                            </Badge>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="archived" className="flex-1 m-0">
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">No archived conversations</p>
          </div>
        </TabsContent>

        <TabsContent value="mentions" className="flex-1 m-0">
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">No mentions</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

