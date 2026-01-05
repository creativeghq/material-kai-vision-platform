import React, { useState, useEffect } from 'react';
import {
  Star,
  ThumbsUp,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Minus,
  Send,
  Loader2,
} from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Textarea } from '@/components/core/ui/textarea';
import { Badge } from '@/components/core/ui/badge';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { getMivaaApiClient } from '@/services/mivaaApiClient';

interface MaterialFeedbackPanelProps {
  materialId: string;
  materialName: string;
  workspaceId: string;
  userId: string;
}

interface Feedback {
  id: string;
  user_id: string;
  feedback_text: string;
  rating: number | null;
  sentiment_analysis: {
    sentiment: 'positive' | 'neutral' | 'negative';
    confidence: number;
    aspects: {
      quality: number;
      appearance: number;
      durability: number;
      value: number;
      usability: number;
    };
    key_phrases: string[];
    recommendation_score: number;
  };
  helpful_count: number;
  created_at: string;
}

export const MaterialFeedbackPanel: React.FC<MaterialFeedbackPanelProps> = ({
  materialId,
  materialName,
  workspaceId,
  userId,
}) => {
  const { toast } = useToast();
  const mivaaClient = getMivaaApiClient();

  const [feedbackList, setFeedbackList] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [feedbackText, setFeedbackText] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  useEffect(() => {
    loadFeedback();
  }, [materialId]);

  const loadFeedback = async () => {
    try {
      setLoading(true);
      const response = await mivaaClient.request(
        `/api/feedback/material/${materialId}?workspace_id=${workspaceId}&limit=50`,
        { method: 'GET' },
      );

      if (response.success && response.data) {
        setFeedbackList(response.data);
      }
    } catch (error) {
      console.error('Error loading feedback:', error);
      toast({
        title: 'Error',
        description: 'Failed to load feedback',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitFeedback = async () => {
    if (!feedbackText.trim() || feedbackText.length < 10) {
      toast({
        title: 'Invalid Feedback',
        description: 'Please provide at least 10 characters of feedback',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSubmitting(true);
      const response = await mivaaClient.request('/api/feedback/submit', {
        method: 'POST',
        body: JSON.stringify({
          workspace_id: workspaceId,
          user_id: userId,
          material_id: materialId,
          feedback_text: feedbackText,
          feedback_type: 'review',
          rating: rating,
          is_verified: false,
          is_public: true,
        }),
      });

      if (response.success) {
        toast({
          title: 'Feedback Submitted',
          description: 'Thank you for your feedback! Sentiment analysis complete.',
        });

        // Reset form
        setFeedbackText('');
        setRating(null);

        // Reload feedback
        loadFeedback();
      } else {
        throw new Error(response.error?.message || 'Failed to submit feedback');
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast({
        title: 'Error',
        description: 'Failed to submit feedback',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkHelpful = async (feedbackId: string) => {
    try {
      await mivaaClient.request(`/api/feedback/${feedbackId}/helpful`, {
        method: 'POST',
      });

      toast({
        title: 'Marked as Helpful',
        description: 'Thank you for your feedback!',
      });

      // Update local state
      setFeedbackList((prev) =>
        prev.map((f) =>
          f.id === feedbackId ? { ...f, helpful_count: f.helpful_count + 1 } : f,
        ),
      );
    } catch (error) {
      console.error('Error marking helpful:', error);
    }
  };

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'negative':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return <Minus className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getSentimentBadge = (sentiment: string) => {
    const colors = {
      positive: 'bg-green-500/20 text-green-300 border-green-500/30',
      negative: 'bg-red-500/20 text-red-300 border-red-500/30',
      neutral: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    };

    return (
      <Badge className={colors[sentiment as keyof typeof colors] || colors.neutral}>
        {sentiment}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Submit Feedback Form */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Share Your Experience</CardTitle>
          <CardDescription className="text-white/60">
            Tell us about your experience with {materialName}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Star Rating */}
          <div>
            <Label className="text-white/80">Rating (Optional)</Label>
            <div className="flex items-center gap-2 mt-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(null)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    className={`h-6 w-6 ${
                      (hoverRating || rating || 0) >= star
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-white/30'
                    }`}
                  />
                </button>
              ))}
              {rating && (
                <span className="text-white/60 text-sm ml-2">{rating} stars</span>
              )}
            </div>
          </div>

          {/* Feedback Text */}
          <div>
            <Label className="text-white/80">Your Feedback</Label>
            <Textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Share your thoughts about this material... (minimum 10 characters)"
              className="min-h-[120px] bg-white/5 border-white/10 text-white mt-2"
            />
            <p className="text-xs text-white/50 mt-1">
              {feedbackText.length}/10 characters minimum
            </p>
          </div>

          {/* Submit Button */}
          <Button
            onClick={handleSubmitFeedback}
            disabled={submitting || feedbackText.length < 10}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Submit Feedback
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Feedback List */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            User Reviews ({feedbackList.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-white/60">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              Loading feedback...
            </div>
          ) : feedbackList.length === 0 ? (
            <div className="text-center py-8 text-white/60">
              No reviews yet. Be the first to share your experience!
            </div>
          ) : (
            <div className="space-y-4">
              {feedbackList.map((feedback) => (
                <Card key={feedback.id} className="bg-white/5 border-white/10">
                  <CardContent className="pt-4">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {feedback.rating && (
                          <div className="flex items-center gap-1">
                            {[...Array(feedback.rating)].map((_, i) => (
                              <Star
                                key={i}
                                className="h-4 w-4 fill-yellow-400 text-yellow-400"
                              />
                            ))}
                          </div>
                        )}
                        {getSentimentBadge(feedback.sentiment_analysis.sentiment)}
                        <span className="text-xs text-white/50">
                          {new Date(feedback.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {getSentimentIcon(feedback.sentiment_analysis.sentiment)}
                        <span className="text-xs text-white/60">
                          {(feedback.sentiment_analysis.confidence * 100).toFixed(0)}%
                          confident
                        </span>
                      </div>
                    </div>

                    {/* Feedback Text */}
                    <p className="text-white/80 mb-3">{feedback.feedback_text}</p>

                    {/* Key Phrases */}
                    {feedback.sentiment_analysis.key_phrases.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {feedback.sentiment_analysis.key_phrases.map((phrase, i) => (
                          <Badge
                            key={i}
                            variant="outline"
                            className="text-xs text-white/60 border-white/20"
                          >
                            {phrase}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Helpful Button */}
                    <Button
                      onClick={() => handleMarkHelpful(feedback.id)}
                      variant="ghost"
                      size="sm"
                      className="text-white/60 hover:text-white hover:bg-white/10"
                    >
                      <ThumbsUp className="h-4 w-4 mr-1" />
                      Helpful ({feedback.helpful_count})
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

