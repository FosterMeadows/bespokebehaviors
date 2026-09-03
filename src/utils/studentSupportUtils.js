export function removeAccommodationFromList(accommodations, accommodationId) {
  return (Array.isArray(accommodations) ? accommodations : [])
    .filter((item) => item?.id !== accommodationId);
}
