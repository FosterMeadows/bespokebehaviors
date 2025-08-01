import React, { useContext, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../firebaseConfig";
import { AuthContext } from "../AuthContext.jsx";
import { useReports } from "../hooks/useReports.jsx";

// Validation schema including contact details
const reportSchema = z.object({
  studentName:     z.string().min(1, "Student name is required"),
  date:            z.string().min(1, "Date is required"),
  gradeLevel:      z.enum(["6","7","8"], "Grade level is required"),
  location:        z.enum(["Classroom","Outside","Hallway"], "Location is required"),
  teacherName:     z.string().min(1, "Teacher name is required"),
  referralDetails: z.string().min(1, "Referral details are required").max(1000, "Max 1000 characters"),
  parentContacted: z.boolean().optional(),
  contactPerson:   z.string().optional(),
  contactMethod:   z.string().optional(),
  contactDetails:  z.string().optional(),
});

export default function ReportForm({ onSuccess }) {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [toast, setToast] = useState({ visible: false, message: "", student: "" });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
    reset,
  } = useForm({
    resolver: zodResolver(reportSchema),
    defaultValues: {
      gradeLevel:      "6",
      location:        "Classroom",
      teacherName:     user.displayName || "",
      parentContacted: false,
      contactPerson:   "",
      contactMethod:   "",
      contactDetails:  "",
    },
  });

  const studentNameValue = watch("studentName");
  const parentContacted = watch("parentContacted");

  // Subscribe to this student's reports for count
  const { reports: studentReports, loading: countLoading } = useReports({ studentName: studentNameValue });
  const existingCount = countLoading ? 0 : studentReports.length;

  // Determine if this submission is the third reteach
  const isThird = existingCount === 2;
  const contactPrompt = isThird
    ? "This is the third Reteach given for this student. You MUST make contact home. If you have already done so, check this box. If you will do it soon, you can add it into My Reports later."
    : "Do you have parent contact relevant to this Reteach that you'd like to add into the system?";

  async function onSubmit(data) {
    if (!user) return;
    setToast({ visible: false, message: "", student: "" });

    // Enforce max 6 reteaches
    if (existingCount >= 6) {
      setToast({
        visible: true,
        message: `This student already has ${existingCount} reteaches.`,
        student: data.studentName,
      });
      return;
    }

    // Submit new report
    await addDoc(collection(db, "reports"), {
      studentName:     data.studentName,
      date:            data.date,
      gradeLevel:      data.gradeLevel,
      location:        data.location,
      teacherName:     data.teacherName,
      referralDetails: data.referralDetails,
      parentContacted: data.parentContacted,
      contactPerson:   data.contactPerson,
      contactMethod:   data.contactMethod,
      contactDetails:  data.contactDetails,
      timestamp:       Timestamp.now(),
      teacherId:       user.uid,
      served:          false,
      comment:         "",
    });

    reset();
    onSuccess?.();
  }

  return (
    <>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="max-w-lg mx-auto p-6 bg-white shadow rounded space-y-6"
      >
        {/* Student Name */}
        <div>
          <label className="block text-sm font-medium">Student Name</label>
          <input
            {...register("studentName")}
            className="mt-1 block w-full border rounded p-2"
            placeholder="e.g. Jillian Simpson"
          />
          {errors.studentName && <p className="text-red-500 text-sm">{errors.studentName.message}</p>}
        </div>

        {/* Date */}
        <div>
          <label className="block text-sm font-medium">Date</label>
          <input
            type="date"
            {...register("date")}
            className="mt-1 block w-full border rounded p-2"
          />
          {errors.date && <p className="text-red-500 text-sm">{errors.date.message}</p>}
        </div>

        {/* Grade Level */}
        <div>
          <span className="block text-sm font-medium mb-1">Grade Level</span>
          <div className="inline-flex rounded-md border overflow-hidden">
            {["6","7","8"].map((lev) => (
              <button
                key={lev}
                type="button"
                onClick={() => setValue("gradeLevel", lev, { shouldValidate: true })}
                className={`px-4 py-2 text-sm font-medium focus:outline-none ${
                  watch("gradeLevel") === lev
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-700 hover:bg-gray-100"
                }`}
              >
                {lev}
              </button>
            ))}
          </div>
          {errors.gradeLevel && <p className="text-red-500 text-sm">{errors.gradeLevel.message}</p>}
        </div>

        {/* Location */}
        <div>
          <label className="block text-sm font-medium">Location</label>
          <select
            {...register('location')}
            className="mt-1 block w-full border rounded p-2"
          >
            <option value="Classroom">Classroom</option>
            <option value="Outside">Outside</option>
            <option value="Hallway">Hallway</option>
          </select>
          {errors.location && <p className="text-red-500 text-sm">{errors.location.message}</p>}
        </div>

        {/* Teacher Name */}
        <div>
          <label className="block text-sm font-medium">Teacher Name</label>
          <input
            {...register('teacherName')}
            className="mt-1 block w-full border rounded p-2"
            placeholder="Your name"
          />
          {errors.teacherName && <p className="text-red-500 text-sm">{errors.teacherName.message}</p>}
        </div>

        {/* Referral Details */}
        <div>
          <label className="block text-sm font-medium">Referral Details</label>
          <textarea
            {...register('referralDetails')}
            className="mt-1 block w-full border rounded p-2 h-24"
            placeholder="Describe behavior or reason for referral..."
          />
          {errors.referralDetails && <p className="text-red-500 text-sm">{errors.referralDetails.message}</p>}
        </div>

        {/* Parent Contact Section (Step 3+) */}
        <div className="p-4 border-t space-y-4">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              {...register('parentContacted')}
              className="form-checkbox"
            />
            <span className="text-sm font-medium">{contactPrompt}</span>
          </label>
          {parentContacted && (
            <div className="space-y-2">
              <div>
                <label className="block text-sm font-medium">Who?</label>
                <input
                  type="text"
                  {...register('contactPerson')}
                  className="mt-1 block w-full border rounded p-2"
                  placeholder="Enter contact name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">How?</label>
                <select
                  {...register('contactMethod')}
                  className="mt-1 block w-full border rounded p-2"
                >
                  <option value="">Select</option>
                  <option value="Text">Text</option>
                  <option value="Call">Call</option>
                  <option value="In-Person">In-Person</option>
                  <option value="Schoology">Schoology</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium">Details</label>
                <input
                  type="text"
                  {...register('contactDetails')}
                  className="mt-1 block w-full border rounded p-2"
                  placeholder="E.g. spoke at 3:30pm"
                />
              </div>
            </div>
          )}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Submitting…' : 'Submit Referral'}
        </button>
      </form>

      {/* Error Toast */}
      {toast.visible && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded shadow-lg flex items-center space-x-4">
          <span>{toast.message}</span>
          <button
            onClick={() => navigate(`/student/${encodeURIComponent(toast.student)}`)}
            className="underline font-medium"
          >
            View History
          </button>
          <button
            onClick={() => setToast((t) => ({ ...t, visible: false }))}
            className="ml-4 text-xl leading-none"
          >
            &times;
          </button>
        </div>
      )}
    </>
  );
}
