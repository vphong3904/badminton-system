const svc = require('../services/ownerService');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { ok, created } = require('../utils/response');
const { fileUrl } = require('../middlewares/upload');

const h = (fn, wrap = ok) => asyncHandler(async (req, res) => wrap(res, await fn(req)));
exports.state = h((r) => svc.onboardingState(r.user.id));
exports.venueStep = h((r) => svc.saveVenueStep(r.user.id, r.body));
exports.pricesStep = h((r) => svc.savePricesStep(r.user.id, r.body.slots));
exports.bankStep = h((r) => svc.saveBankStep(r.user.id, r.body));
exports.submit = h((r) => svc.submitOnboarding(r.user.id));

exports.getVenue = h((r) => svc.getVenue(r.user.id));
exports.updateVenue = h((r) => svc.updateVenue(r.user.id, r.body));
exports.updatePrices = h((r) => svc.replacePrices(r.user.id, r.body.slots));
exports.venueImage = h((r) => {
  if (!r.file) throw AppError.badRequest('Thiếu file ảnh (field "image")');
  return svc.setVenueImage(r.user.id, fileUrl(r.file));
});
exports.listCourts = h((r) => svc.listCourts(r.user.id));
exports.createCourt = h((r) => svc.createCourt(r.user.id, r.body), created);
exports.updateCourt = h((r) => svc.updateCourt(r.user.id, r.params.id, r.body));
exports.createBlock = h((r) => svc.createBlock(r.user.id, r.body), created);
exports.listBlocks = h((r) => svc.listBlocks(r.user.id, r.query));
exports.deleteBlock = h(async (r) => { await svc.deleteBlock(r.user.id, r.params.id); return { deleted: true }; });
