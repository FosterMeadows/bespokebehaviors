// Existing synthetic records for the local dev-owner preview.
export const MOCK_STUDENTS = [
  { id: "dev-student-1", displayName: "Timmy Turner", grade: "6", homeroom: "Carter HR", behaviorBuybacks: 0 },
  { id: "dev-student-2", displayName: "Billy Batson", grade: "7", homeroom: "Martin HR", behaviorBuybacks: 0 },
  { id: "dev-student-3", displayName: "Sara Bell", grade: "8", homeroom: "Patel HR", behaviorBuybacks: 0 }
];

export const MOCK_COUNTS = {
  "dev-student-1": {
    served: 2,
    buybacks: 0,
    adjusted: 2,
    servedRecords: [
      { id: "dev-served-1", reteachDate: "2026-05-06", assignedByName: "A. Carter", context: "Procedures", location: "Classroom" },
      { id: "dev-served-2", reteachDate: "2026-05-21", assignedByName: "Dev Owner", context: "Transition", location: "Hallway" }
    ]
  },
  "dev-student-2": {
    served: 5,
    buybacks: 0,
    adjusted: 5,
    servedRecords: [
      { id: "dev-served-3", reteachDate: "2026-04-15", assignedByName: "M. Davis", context: "Transition", location: "Hallway" },
      { id: "dev-served-4", reteachDate: "2026-04-29", assignedByName: "Dev Owner", context: "Materials", location: "Classroom" },
      { id: "dev-served-5", reteachDate: "2026-05-07", assignedByName: "S. Patel", context: "Technology use", location: "Classroom" },
      { id: "dev-served-6", reteachDate: "2026-05-18", assignedByName: "A. Carter", context: "Transition", location: "Hallway" },
      { id: "dev-served-7", reteachDate: "2026-06-02", assignedByName: "Dev Owner", context: "Transition", location: "Classroom" }
    ]
  },
  "dev-student-3": {
    served: 6,
    buybacks: 0,
    adjusted: 6,
    servedRecords: [
      { id: "dev-served-8", reteachDate: "2026-03-11", assignedByName: "M. Davis", context: "Respectful participation", location: "Classroom" },
      { id: "dev-served-9", reteachDate: "2026-03-25", assignedByName: "Dev Owner", context: "Transition", location: "Hallway" },
      { id: "dev-served-10", reteachDate: "2026-04-09", assignedByName: "A. Carter", context: "Procedures", location: "Cafeteria" },
      { id: "dev-served-11", reteachDate: "2026-04-22", assignedByName: "S. Patel", context: "Transition", location: "Hallway" },
      { id: "dev-served-12", reteachDate: "2026-05-14", assignedByName: "Dev Owner", context: "Side conversations", location: "Classroom" },
      { id: "dev-served-13", reteachDate: "2026-05-29", assignedByName: "M. Davis", context: "Transition", location: "Classroom" }
    ]
  }
};
