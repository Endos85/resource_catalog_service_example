/**
 * helpers/enrich_resource.js
 * @file Helfer zum Anreichern eines Ressourcenobjekts mit Bewertungen & Feedback.
 */

import Rating from '../models/rating.js';
import Feedback from '../models/feedback.js';
import { toClient } from '../utils/mongo.js';

export async function buildEnrichedResource(resource) {
  if (!resource?._id) return null;
  const _id = resource._id;

  // Ratings durchschn. berechnen
  const ratingAgg = await Rating.aggregate([
    { $match: { resourceId: _id } },
    { $group: { _id: null, avg: { $avg: "$ratingValue" } } }
  ]);
  const averageRating = ratingAgg[0]?.avg
    ? Math.round(ratingAgg[0].avg * 100) / 100
    : 0;

  // Feedback laden
  const feedback = await Feedback.find({ resourceId: _id }).lean();

  return {
    ...toClient(resource),
    averageRating,
    feedback: feedback.map(toClient) // immer Array, evtl. leer
  };
}
