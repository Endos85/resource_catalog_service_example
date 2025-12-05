//routes/resources.js in resource_catalog_service_example
import express from 'express';
import { validateResource, validateRating, validateFeedback } from '../middleware/validation.js';
import { validateObjectId } from '../middleware/validateObjectId.js';
import Resource from '../models/resource.js';
import Rating from '../models/rating.js';
import Feedback from '../models/feedback.js';
import { toObjectId, toClient } from '../utils/mongo.js';
import { buildEnrichedResource } from '../helpers/enrich_resource.js';

const router = express.Router();

// --- RESOURCES ---

router.get('/', async (req, res, next) => {
  try {
    const resources = await Resource.find().lean();
    const ratingAgg = await Rating.aggregate([
      { $group: { _id: "$resourceId", avg: { $avg: "$ratingValue" } } }
    ]);
    const avgMap = Object.fromEntries(
      ratingAgg.map(r => [String(r._id), Math.round(r.avg * 100) / 100])
    );
    res.status(200).json(
      resources.map(r => ({ ...toClient(r), averageRating: avgMap[r._id] ?? 0 }))
    );
  } catch (err) {
    console.error(err);
    next(err);
  }
});

// GET Ressource by ID
router.get('/:id', validateObjectId('id'), async (req, res, next) => {
  try {
    const resource = await Resource.findById(toObjectId(req.params.id)).lean();
    if (!resource)
      return res
        .status(404)
        .json({ error: `Ressource mit ID ${req.params.id} nicht gefunden.` });
    res.status(200).json(await buildEnrichedResource(resource));
  } catch (err) {
    console.error(err);
    next(err);
  }
});

// POST neue Ressource
router.post('/', validateResource, async (req, res, next) => {
  try {
    const resource = await new Resource({
      ...req.body,
      createdAt: new Date()
    }).save();
    res.status(201).json(toClient(resource.toObject()));
  } catch (err) {
    console.error(err);
    next(err);
  }
});

// PUT Ressource aktualisieren
router.put('/:id', validateObjectId('id'), validateResource, async (req, res, next) => {
  try {
    if (!req.body || !Object.keys(req.body).length)
      return res
        .status(400)
        .json({ error: 'Keine Daten zum Aktualisieren vorhanden.' });

    const updated = await Resource.findByIdAndUpdate(
      toObjectId(req.params.id),
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!updated)
      return res
        .status(404)
        .json({ error: `Ressource mit ID ${req.params.id} nicht gefunden.` });

    res.status(200).json(await buildEnrichedResource(updated.toObject()));
  } catch (err) {
    console.error(err);
    next(err);
  }
});

// DELETE Ressource
router.delete('/:id', validateObjectId('id'), async (req, res, next) => {
  try {
    const _id = toObjectId(req.params.id);
    const deleted = await Resource.findByIdAndDelete(_id);
    if (!deleted)
      return res
        .status(404)
        .json({ error: `Ressource mit ID ${req.params.id} nicht gefunden.` });

    await Promise.all([
      Rating.deleteMany({ resourceId: _id }),
      Feedback.deleteMany({ resourceId: _id })
    ]);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    next(err);
  }
});

// --- RATINGS ---

router.post('/:resourceId/ratings',
  validateObjectId('resourceId'),
  validateRating,
  async (req, res, next) => {
    try {
      const _id = toObjectId(req.params.resourceId);
      const resource = await Resource.findById(_id).lean();
      if (!resource)
        return res.status(404).json({
          error: `Ressource mit ID ${req.params.resourceId} nicht gefunden.`
        });

      await new Rating({
        resourceId: _id,
        ratingValue: Number(req.body.ratingValue),
        userId: req.body.userId || 'anonymous',
        createdAt: new Date()
      }).save();

      const updatedResource = await Resource.findById(_id).lean();
      res.status(201).json(await buildEnrichedResource(updatedResource));
    } catch (err) {
      console.error(err);
      next(err);
    }
  }
);

// --- FEEDBACK ---

router.post('/:resourceId/feedback',
  validateObjectId('resourceId'),
  validateFeedback,
  async (req, res, next) => {
    try {
      const _id = toObjectId(req.params.resourceId);
      const resource = await Resource.findById(_id).lean();
      if (!resource)
        return res.status(404).json({
          error: `Ressource mit ID ${req.params.resourceId} nicht gefunden.`
        });

      await new Feedback({
        resourceId: _id,
        feedbackText: req.body.feedbackText.trim(),
        userId: req.body.userId || 'anonymous',
        createdAt: new Date(),
        updatedAt: new Date()
      }).save();

      const updatedResource = await Resource.findById(_id).lean();
      res.status(201).json(await buildEnrichedResource(updatedResource));
    } catch (err) {
      console.error(err);
      next(err);
    }
  }
);

router.put('/:resourceId/feedback/:feedbackId',
  validateObjectId('resourceId'),
  validateObjectId('feedbackId'),
  validateFeedback,
  async (req, res, next) => {
    try {
      const _id = toObjectId(req.params.resourceId);
      const updatedFeedback = await Feedback.findOneAndUpdate(
        { _id: req.params.feedbackId, resourceId: _id },
        { feedbackText: req.body.feedbackText.trim(), updatedAt: new Date() },
        { new: true, lean: true }
      );
      if (!updatedFeedback)
        return res.status(404).json({
          error: `Feedback mit ID ${req.params.feedbackId} für Ressource ${req.params.resourceId} nicht gefunden.`
        });

      const resource = await Resource.findById(_id).lean();
      res.status(200).json(await buildEnrichedResource(resource));
    } catch (err) {
      console.error(err);
      next(err);
    }
  }
);

router.delete('/:resourceId/feedback/:feedbackId',
  validateObjectId('resourceId'),
  validateObjectId('feedbackId'),
  async (req, res, next) => {
    try {
      const _id = toObjectId(req.params.resourceId);
      const deleted = await Feedback.findOneAndDelete({
        _id: req.params.feedbackId,
        resourceId: _id
      });
      if (!deleted)
        return res.status(404).json({
          error: `Feedback mit ID ${req.params.feedbackId} für Ressource ${req.params.resourceId} nicht gefunden.`
        });

      res.status(204).end();
    } catch (err) {
      console.error(err);
      next(err);
    }
  }
);

export default router;
