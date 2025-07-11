import React, { useState } from 'react';
import { Material } from '@/types/materials';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Heart, Share2, Eye, Edit, Camera, Plus, Trash2, MoreVertical } from 'lucide-react';
import { AddToBoardModal } from '@/components/MoodBoard/AddToBoardModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface MaterialCardProps {
  material: Material;
  onView?: (material: Material) => void;
  onEdit?: (material: Material) => void;
  onDelete?: (material: Material) => void;
  onFavorite?: (material: Material) => void;
  onAddToBoard?: (material: Material) => void;
  showActions?: boolean;
}

export const MaterialCard: React.FC<MaterialCardProps> = ({
  material,
  onView,
  onEdit,
  onDelete,
  onFavorite,
  onAddToBoard,
  showActions = true
}) => {
  const [showAddToBoardModal, setShowAddToBoardModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleCardClick = () => {
    onView?.(material);
  };

  const handleAddToBoard = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowAddToBoardModal(true);
    onAddToBoard?.(material);
  };

  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer group">
      <CardContent className="p-4">
        {/* Material Image */}
        <div 
          className="aspect-square bg-muted rounded-lg mb-3 overflow-hidden"
          onClick={handleCardClick}
        >
          {material.imageUrl ? (
            <img
              src={material.imageUrl}
              alt={material.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Camera className="w-8 h-8 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Material Info */}
        <div className="space-y-2">
          <div onClick={handleCardClick}>
            <h4 className="font-medium text-sm line-clamp-1">{material.name}</h4>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {material.description}
            </p>
          </div>

          {/* Material Properties */}
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-xs">
              {material.category}
            </Badge>
            {material.metadata.brand && (
              <span className="text-xs text-muted-foreground">
                {material.metadata.brand}
              </span>
            )}
          </div>

          {/* Material Attributes */}
          <div className="flex flex-wrap gap-1">
            {material.metadata.color && (
              <Badge variant="secondary" className="text-xs px-2 py-0">
                {material.metadata.color}
              </Badge>
            )}
            {material.metadata.finish && (
              <Badge variant="secondary" className="text-xs px-2 py-0">
                {material.metadata.finish}
              </Badge>
            )}
          </div>

          {/* Action Buttons */}
          {showActions && (
            <div className="flex items-center justify-between pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="flex space-x-1">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    onView?.(material);
                  }}
                  title="View Details"
                >
                  <Eye className="w-3 h-3" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7"
                  onClick={handleAddToBoard}
                  title="Add to MoodBoard"
                >
                  <Plus className="w-3 h-3" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFavorite?.(material);
                  }}
                  title="Add to Favorites"
                >
                  <Heart className="w-3 h-3" />
                </Button>
              </div>
              <div className="flex space-x-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit?.(material);
                      }}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Edit Material
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        // Handle share action
                      }}
                    >
                      <Share2 className="w-4 h-4 mr-2" />
                      Share Material
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDeleteDialog(true);
                      }}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Material
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}
        </div>

        {/* Add to Board Modal */}
        <AddToBoardModal 
          open={showAddToBoardModal}
          onOpenChange={setShowAddToBoardModal}
          material={material}
        />

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Material</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{material.name}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  onDelete?.(material);
                  setShowDeleteDialog(false);
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
};