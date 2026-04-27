import { Request, Response, NextFunction } from 'express';
import { RecommendationService } from './recommendation.service';
import { ResponseUtil } from '../../core/utils/response';

export class RecommendationController {
  constructor(private readonly recommendationService: RecommendationService) {}

  /**
   * @swagger
   * /recommendations:
   *   get:
   *     tags: [Recommendations]
   *     summary: Get personalized opportunity recommendations
   */
  getMyRecommendations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const recommendations = await this.recommendationService.getRecommendations(req.user!.userId);
      ResponseUtil.success(res, recommendations, `Found ${recommendations.length} recommendations`);
    } catch (error) {
      next(error);
    }
  };

  /**
   * @swagger
   * /recommendations/explore:
   *   get:
   *     tags: [Recommendations]
   *     summary: Get recommendations by tags and location (no auth required)
   *     parameters:
   *       - in: query
   *         name: tags
   *         schema: { type: string }
   *         description: Comma-separated tags
   *       - in: query
   *         name: location
   *         schema: { type: string }
   *       - in: query
   *         name: limit
   *         schema: { type: integer }
   */
  explore = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tags, location, limit } = req.query as Record<string, string>;
      const tagList = tags ? tags.split(',').map((t) => t.trim().slice(0, 50)).filter(Boolean) : [];
      const safeLimit = Math.min(Math.max(1, Number(limit) || 10), 50); // cap at 50
      const results = await this.recommendationService.getByPreferences(
        tagList,
        location || '',
        safeLimit,
      );
      ResponseUtil.success(res, results);
    } catch (error) {
      next(error);
    }
  };
}
