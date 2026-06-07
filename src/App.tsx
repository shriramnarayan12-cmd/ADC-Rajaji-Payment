import React, { useState, useEffect, useMemo } from 'react';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase'; // Ensure your firebase config is linked properly
import { CreditCard, CheckCircle2, AlertCircle, X } from 'lucide-react';

interface Student {
  id: string;
  reg_no: string;
  name: string;
  batch_name: string;
  payment_frequency: 'Monthly' | 'Quarterly';
  isArchived?: boolean;
}

interface FormData {
  batch_name: string;
  reg_no: string;
  period: string;
  txn_id: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ==========================================
// --- RAJAJINAGAR CONFIGURATION ---
// ==========================================

// 1. ALLOWED BATCHES (App will ONLY fetch and show these batches)
const RAJAJINAGAR_BATCHES = [
  "TUE-THU 5PM Maanvi",
  "TUE-THU 6:30PM MAANVI",
  "TUE-THU 6PM MAANVI",
  "SAT-SUN 8:30AM ROHINI",
  "SAT-SUN 9:30AM ROHINI",
  "SAT - SUN 7:30AM ROHINI",
  "TUE-THU 7:30PM RAJ"
];

// 2. SINGLE ACCOUNT DETAILS FOR ALL RAJAJINAGAR BATCHE
// Fill these in when you get the details later
const RAJAJINAGAR_ACCOUNT = {
  qrBase64: "data:image/jpeg;base64,YOUR_BASE64_HERE",
  fileName: "Rajajinagar_Bank_QR.png",
  name: "Account Name Here",
  accNum: "00000000000",
  ifsc: "IFSC0000000",
  type: "Savings",
  upi: "upi_id_here@upi"
};
// ==========================================

export default function App() {
  const [batches, setBatches] = useState<string[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [batchFees, setBatchFees] = useState<Record<string, number>>({});
  
  const [formData, setFormData] = useState<FormData>({
    batch_name: '',
    reg_no: '',
    period: '',
    txn_id: ''
  });

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);

  // 1. Fetch Batches (Filtered for Rajajinagar only)
  useEffect(() => {
    const fetchBatches = async () => {
      try {
        const batchesSnapshot = await getDocs(collection(db, 'batches'));
        const fetchedBatches: string[] = [];
        const fetchedBatchFees: Record<string, number> = {};
        
        batchesSnapshot.forEach((doc) => {
          const data = doc.data();
          const batchName = data.name || doc.id;
          const baseFee = data.base_fee || data.fee || 0;
          
          // ONLY add the batch if it is in our RAJAJINAGAR_BATCHES list
          if (RAJAJINAGAR_BATCHES.includes(batchName)) {
            fetchedBatches.push(batchName);
            fetchedBatchFees[batchName] = Number(baseFee);
          }
        });

        setBatches(fetchedBatches);
        setBatchFees(fetchedBatchFees);
        setError(null);
      } catch (err) {
        console.error("Error fetching batches:", err);
        setError("Failed to connect to the database. Please check your Firebase configuration.");
      } finally {
        setLoading(false);
      }
    };

    fetchBatches();
  }, []);

  // 2. Fetch Students
  useEffect(() => {
    const fetchStudents = async () => {
      if (!formData.batch_name) {
        setStudents([]);
        return;
      }

      try {
        const q = query(collection(db, 'students'), where('batch_name', '==', formData.batch_name));
        const querySnapshot = await getDocs(q);
        const fetchedStudents: Student[] = [];
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.isArchived !== true) {
            fetchedStudents.push({
              id: doc.id,
              reg_no: data.reg_no,
              name: data.name,
              batch_name: data.batch_name,
              payment_frequency: data.payment_frequency || 'Monthly',
              isArchived: data.isArchived
            });
          }
        });

        setStudents(fetchedStudents);
      } catch (err) {
        console.error("Error fetching students:", err);
        setError("Failed to fetch students for the selected batch.");
      }
    };

    fetchStudents();
    setFormData(prev => ({ ...prev, reg_no: '', period: '' }));
  }, [formData.batch_name]);

  const selectedStudent = useMemo(() => {
    return students.find(s => s.reg_no === formData.reg_no);
  }, [students, formData.reg_no]);

  // 3. Dynamic Period Logic (Same as main app)
  const availablePeriods = useMemo(() => {
    if (!selectedStudent) return [];
    const monthIndex = new Date().getMonth(); 
    
    if (monthIndex === 3 || monthIndex === 4) return []; // April/May closed
    
    if (selectedStudent.payment_frequency === 'Monthly') {
      return [MONTHS[monthIndex]];
    } else {
      if (monthIndex >= 5 && monthIndex <= 7) return ['June/Jul/Aug'];
      if (monthIndex >= 8 && monthIndex <= 10) return ['Sep/Oct/Nov'];
      if (monthIndex === 11 || monthIndex === 0 || monthIndex === 1) return ['Dec/Jan/Feb'];
      if (monthIndex === 2) return ['March'];
      return [];
    }
  }, [selectedStudent]);

  useEffect(() => {
    if (availablePeriods.length === 1) {
      setFormData(prev => ({ ...prev, period: availablePeriods[0] }));
    } else if (availablePeriods.length === 0) {
      setFormData(prev => ({ ...prev, period: '' }));
    }
  }, [availablePeriods]);

  // 4. CLEAN Fee Calculation (No Fines, No Blocks, No Additions)
  const calculatedAmount = useMemo(() => {
    if (!formData.batch_name || !selectedStudent || !formData.period) return 0;
    
    const baseFee = batchFees[formData.batch_name] || 0;
    
    let multiplier = 1; 
    if (selectedStudent.payment_frequency === 'Quarterly') {
      if (formData.period === 'March') {
        multiplier = 1; 
      } else {
        multiplier = 3; 
      }
    }
    
    return baseFee * multiplier;
  }, [formData.batch_name, selectedStudent, batchFees, formData.period]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.batch_name || !formData.reg_no || !formData.period || !formData.txn_id) {
      setError("Please fill in all required fields.");
      return;
    }

    if (!selectedStudent) {
      setError("Invalid student selected.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await addDoc(collection(db, 'payments'), {
        reg_no: formData.reg_no,
        student_name: selectedStudent.name,
        batch_name: formData.batch_name,
        payment_frequency: selectedStudent.payment_frequency,
        period_paid: formData.period,
        amount_paid: calculatedAmount,
        transaction_id: formData.txn_id,
        payment_date: new Date().toISOString()
      });

      setSuccess(true);
      
      setReceiptData({
        student_name: selectedStudent.name,
        reg_no: formData.reg_no,
        batch_name: formData.batch_name,
        period: formData.period,
        amount: calculatedAmount,
        txn_id: formData.txn_id,
        date: new Date().toLocaleString('en-IN')
      });

      setFormData({
        batch_name: '',
        reg_no: '',
        period: '',
        txn_id: ''
      });

    } catch (err) {
      console.error("Error submitting payment:", err);
      setError("Failed to submit payment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-gray-500 font-medium">Loading ADC Fees Portal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8 font-sans print:py-0 print:bg-white">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden print:hidden">
        
        {/* Header */}
        <div className="bg-blue-600 px-6 py-8 text-center">
          <div className="mx-auto bg-white/20 h-16 w-16 rounded-full flex items-center justify-center mb-4">
            <CreditCard className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Rajajinagar Fees Portal</h1>
          <p className="text-blue-100 mt-2 text-sm">Secure online fee payment</p>
        </div>

        <div className="px-6 py-8">
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start">
              <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-start">
              <CheckCircle2 className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" />
              <span className="text-sm">Payment submitted successfully!</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Batch Selection */}
            <div>
              <label htmlFor="batch_name" className="block text-sm font-medium text-gray-700 mb-1">
                Select Batch
              </label>
              <select
                id="batch_name"
                name="batch_name"
                value={formData.batch_name}
                onChange={handleInputChange}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors"
                required
              >
                <option value="">-- Select a Batch --</option>
                {batches.map(batch => (
                  <option key={batch} value={batch}>{batch}</option>
                ))}
              </select>
            </div>

            {/* Student Selection */}
            <div>
              <label htmlFor="reg_no" className="block text-sm font-medium text-gray-700 mb-1">
                Select Student
              </label>
              <select
                id="reg_no"
                name="reg_no"
                value={formData.reg_no}
                onChange={handleInputChange}
                disabled={!formData.batch_name || students.length === 0}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors disabled:bg-gray-100 disabled:text-gray-500"
                required
              >
                <option value="">-- Select Student Name --</option>
                {students.map(student => (
                  <option key={student.reg_no} value={student.reg_no}>
                    {student.name} ({student.reg_no})
                  </option>
                ))}
              </select>
              {formData.batch_name && students.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">No students found in this batch.</p>
              )}
            </div>

            {/* Period Selection */}
            <div>
              <label htmlFor="period" className="block text-sm font-medium text-gray-700 mb-1">
                Payment Period
              </label>
              <select
                id="period"
                name="period"
                value={formData.period}
                onChange={handleInputChange}
                disabled={!selectedStudent || availablePeriods.length === 0}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors disabled:bg-gray-100 disabled:text-gray-500"
                required
              >
                <option value="">-- Select Period --</option>
                {availablePeriods.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              {selectedStudent && availablePeriods.length === 0 && (
                <p className="text-xs text-red-600 mt-1.5 font-medium">School is closed in April and May. No online payments required.</p>
              )}
            </div>

            {/* Amount Due Display (No blocking warnings needed) */}
            <div className="bg-blue-50 rounded-xl p-6 border border-blue-100 text-center my-6">
              <p className="text-sm font-medium text-blue-800 mb-1 uppercase tracking-wider">Amount Due</p>
              <p className="text-4xl font-bold text-blue-900">
                ₹{calculatedAmount.toLocaleString('en-IN')}
              </p>
              {selectedStudent && (
                <p className="text-xs text-blue-600 mt-2">
                  Based on {selectedStudent.payment_frequency} frequency
                </p>
              )}
            </div>

            {/* STATIC QR CODE & INSTRUCTIONS */}
            <div className="border border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center bg-white shadow-sm my-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4 text-center">Payment Details</h2>

              <img 
                src={RAJAJINAGAR_ACCOUNT.qrBase64} 
                alt={`${RAJAJINAGAR_ACCOUNT.name} QR Code`} 
                className="w-48 h-48 object-contain mb-4 border-4 border-gray-50 rounded-lg p-2 bg-white"
              />
              
              <a 
                href={RAJAJINAGAR_ACCOUNT.qrBase64} 
                download={RAJAJINAGAR_ACCOUNT.fileName}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg shadow-sm transition-colors mb-6 text-sm text-center w-full max-w-xs"
              >
                Download QR to Gallery
              </a>

              <div className="bg-blue-50 rounded-lg p-4 w-full border border-blue-100">
                <p className="text-sm font-bold text-blue-900 mb-2">How to Pay:</p>
                <ol className="text-xs text-blue-800 space-y-1.5 list-decimal list-inside text-left mb-4">
                  <li>Tap the <strong>Blue button</strong> above to save the QR.</li>
                  <li>Open <strong>GPay</strong> or <strong>PhonePe</strong>.</li>
                  <li>Choose <strong>"Scan Any QR"</strong>.</li>
                  <li>Tap the <strong>Gallery/Image icon</strong> and select the QR you just saved.</li>
                </ol>
                
                <div className="mt-3 p-3 bg-white rounded border border-blue-200 text-left text-xs text-blue-900 space-y-1.5">
                  <p className="font-bold text-sm mb-1 text-blue-950 border-b border-blue-100 pb-1">Account Details</p>
                  <p><span className="font-semibold text-gray-600">Name:</span> {RAJAJINAGAR_ACCOUNT.name}</p>
                  <p><span className="font-semibold text-gray-600">Acc Num:</span> {RAJAJINAGAR_ACCOUNT.accNum}</p>
                  <p><span className="font-semibold text-gray-600">IFSC Code:</span> {RAJAJINAGAR_ACCOUNT.ifsc}</p>
                  <p><span className="font-semibold text-gray-600">Type of Account:</span> {RAJAJINAGAR_ACCOUNT.type}</p>
                  <p><span className="font-semibold text-gray-600">UPI Id:</span> {RAJAJINAGAR_ACCOUNT.upi}</p>
                </div>
              </div>
            </div>

            {/* Transaction ID Input */}
            <div>
              <label htmlFor="txn_id" className="block text-sm font-medium text-gray-700 mb-1">
                UPI Transaction ID
              </label>
              <input
                type="text"
                id="txn_id"
                name="txn_id"
                value={formData.txn_id}
                onChange={handleInputChange}
                placeholder="e.g. 123456789012"
                maxLength={12}
                minLength={12}
                pattern="\d{12}"
                title="UPI Transaction ID must be exactly 12 digits"
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors"
                required
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !calculatedAmount}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg shadow-md hover:shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed mt-4 flex justify-center items-center"
            >
              {submitting ? (
                <>
                  <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Processing...
                </>
              ) : (
                'Submit Payment Details'
              )}
            </button>
          </form>
        </div>
      </div>
      
      <p className="text-xs text-gray-400 mt-8 text-center max-w-xs print:hidden">
        Secure SSL encrypted connection. Powered by Stripe & Firebase.
      </p>

      {/* RECEIPT MODAL OVERLAY */}
      {receiptData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:static print:bg-transparent print:p-0">
         <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300 print:shadow-none print:w-full print:max-w-none">
            <div className="bg-green-600 px-6 py-5 text-center relative">
              <button 
                onClick={() => setReceiptData(null)}
                className="absolute top-4 right-4 text-white/80 hover:text-white focus:outline-none"
              >
                <X className="h-6 w-6" />
              </button>
              <div className="mx-auto bg-white/20 h-14 w-14 rounded-full flex items-center justify-center mb-3">
                <CheckCircle2 className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-wide">Payment Successful!</h2>
              <p className="text-green-100 mt-1 text-sm font-medium">Abhinava Dance School</p>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex justify-between border-b border-gray-100 pb-3">
                <span className="text-gray-500">Student</span>
                <span className="font-medium text-gray-900">{receiptData.student_name}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-3">
                <span className="text-gray-500">Reg No</span>
                <span className="font-medium text-gray-900">{receiptData.reg_no}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-3">
                <span className="text-gray-500">Batch</span>
                <span className="font-medium text-gray-900">{receiptData.batch_name}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-3">
                <span className="text-gray-500">Period</span>
                <span className="font-medium text-gray-900">{receiptData.period}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-3">
                <span className="text-gray-500">Txn ID</span>
                <span className="font-medium text-gray-900 uppercase">{receiptData.txn_id}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-3">
                <span className="text-gray-500">Date</span>
                <span className="font-medium text-gray-900 text-sm">{receiptData.date}</span>
              </div>
              <div className="flex justify-between pt-2 items-center">
                <span className="text-gray-600 font-bold uppercase tracking-wider text-sm">Total Paid</span>
                <span className="text-2xl font-bold text-blue-600">₹{receiptData.amount.toLocaleString('en-IN')}</span>
              </div>
            </div>
            
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex gap-3 print:hidden">
              <button
                onClick={() => window.print()}
                className="flex-1 bg-white border border-gray-300 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-200"
              >
                Print
              </button>
              <button
                onClick={() => {
                  setReceiptData(null);
                  setSuccess(false); 
                }}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
