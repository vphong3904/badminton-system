import '../models/court.dart';

const sampleCourts = <Court>[
  Court(
    id: 'C001',
    name: 'Sân cầu lông Phú Thọ',
    address: 'Quận 11, TP. Hồ Chí Minh',
    pricePerHour: 80000,
    rating: 4.8,
    numberOfCourts: 8,
    amenities: ['Bãi giữ xe', 'Phòng thay đồ', 'Căng tin', 'Điều hòa'],
  ),
  Court(
    id: 'C002',
    name: 'Sân cầu lông Tân Bình',
    address: 'Quận Tân Bình, TP. Hồ Chí Minh',
    pricePerHour: 70000,
    rating: 4.6,
    numberOfCourts: 6,
    amenities: ['Bãi giữ xe', 'Nhà vệ sinh', 'Căng tin'],
  ),
  Court(
    id: 'C003',
    name: 'Sân cầu lông Bình Thạnh',
    address: 'Quận Bình Thạnh, TP. Hồ Chí Minh',
    pricePerHour: 90000,
    rating: 4.9,
    numberOfCourts: 10,
    amenities: ['Bãi giữ xe', 'Phòng thay đồ', 'Điều hòa'],
  ),
  Court(
    id: 'C004',
    name: 'Sân cầu lông Gò Vấp',
    address: 'Quận Gò Vấp, TP. Hồ Chí Minh',
    pricePerHour: 65000,
    rating: 4.5,
    numberOfCourts: 5,
  ),
];
