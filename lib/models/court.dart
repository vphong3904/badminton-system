class Court {
  final String id;
  final String name;
  final String address;
  final int pricePerHour;
  final double rating;
  final int numberOfCourts;
  final List<String> amenities;
  final bool isActive;

  const Court({
    required this.id,
    required this.name,
    required this.address,
    required this.pricePerHour,
    this.rating = 0,
    this.numberOfCourts = 1,
    this.amenities = const [],
    this.isActive = true,
  });

  Court copyWith({
    String? id,
    String? name,
    String? address,
    int? pricePerHour,
    double? rating,
    int? numberOfCourts,
    List<String>? amenities,
    bool? isActive,
  }) {
    return Court(
      id: id ?? this.id,
      name: name ?? this.name,
      address: address ?? this.address,
      pricePerHour: pricePerHour ?? this.pricePerHour,
      rating: rating ?? this.rating,
      numberOfCourts: numberOfCourts ?? this.numberOfCourts,
      amenities: amenities ?? this.amenities,
      isActive: isActive ?? this.isActive,
    );
  }
}
