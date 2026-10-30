const router = require('express').Router();
const c = require('../controllers/ownerController');
const v = require('../validators/owner');
const validate = require('../middlewares/validate');
const { authenticate, requireRole, requireApprovedOwner } = require('../middlewares/auth');
const { upload } = require('../middlewares/upload');

router.use(authenticate, requireRole('owner'));

// Onboarding (dùng được khi chưa duyệt)
router.get('/onboarding', c.state);
router.put('/onboarding/venue', validate(v.venue), c.venueStep);
router.put('/onboarding/prices', validate(v.prices), c.pricesStep);
router.put('/onboarding/bank', validate(v.bank), c.bankStep);
router.post('/onboarding/submit', c.submit);

// Chỉ sau khi admin duyệt
router.use(requireApprovedOwner);
router.get('/venue', c.getVenue);
router.put('/venue', validate(v.venue), c.updateVenue);
router.put('/venue/prices', validate(v.prices), c.updatePrices);
router.post('/venue/image', upload.single('image'), c.venueImage);
router.get('/courts', c.listCourts);
router.post('/courts', validate(v.court), c.createCourt);
router.patch('/courts/:id', validate(v.courtUpdate), c.updateCourt);
router.get('/court-blocks', validate(v.blockList), c.listBlocks);
router.post('/court-blocks', validate(v.block), c.createBlock);
router.delete('/court-blocks/:id', validate(v.blockId), c.deleteBlock);
module.exports = router;
