import React, { useState } from 'react';
import axios from 'axios';

function App() {
  const [jobDescription, setJobDescription] = useState('');
  const [resumes, setResumes] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileChange = (event) => {
    const files = Array.from(event.target.files);
    setResumes(files);
  };

  const analyzeResumes = async () => {
    setLoading(true);
    setError(null);
    setResults([]); // Clear previous results

    const formData = new FormData();
    formData.append('jobDescription', jobDescription);
    resumes.forEach((file) => {
      formData.append('resumes', file);
    });

    try {
      const response = await axios.post('http://localhost:5000/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResults(response.data);
    } catch (err) {
      console.error('Error analyzing resumes:', err);
      setError('Failed to analyze resumes. Please try again. Ensure the backend server is running and accessible.');
    } finally {
      setLoading(false);
    }
  };

  // Function to handle downloading the original file
  const downloadOriginalFile = (savedFilename, originalFilename) => {
    if (!savedFilename) {
      alert("No file available for download.");
      return;
    }
    // Construct the URL to the backend's download endpoint
    const fileUrl = `http://localhost:5000/download/${savedFilename}`;
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = originalFilename; // Use original filename for the download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const styles = {
    appContainer: {
      backgroundImage: `url('https://cdn.pixabay.com/photo/2011/12/13/14/26/andromeda-11004_1280.jpg')`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      minHeight: '100vh',
      width: '100vw',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      boxSizing: 'border-box',
    },
    card: {
      background: 'rgba(255, 255, 255, 0.1)',
      borderRadius: 15,
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      padding: 30,
      width: '100%',
      maxWidth: 800,
      color: '#fff',
      boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
      fontFamily: 'Arial, sans-serif',
      maxHeight: '90vh',
      overflowY: 'auto',
    },
    heading: {
      textAlign: 'center',
      fontSize: 36,
      marginBottom: 20,
      color: '#fff',
      fontWeight: 'bold',
      textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
    },
    textarea: {
      width: '100%',
      padding: 15,
      borderRadius: 10,
      border: 'none',
      fontSize: 16,
      marginBottom: 20,
      backgroundColor: 'rgba(255,255,255,0.8)',
      color: '#000',
      resize: 'vertical',
    },
    fileInput: {
      marginBottom: 10,
      color: '#fff',
      backgroundColor: 'rgba(0,0,0,0.3)',
      padding: '8px 10px',
      borderRadius: 5,
      cursor: 'pointer',
      display: 'block',
      textAlign: 'center',
    },
    button: {
      padding: '12px 24px',
      fontSize: 16,
      backgroundColor: '#28a745',
      color: 'white',
      border: 'none',
      borderRadius: 10,
      cursor: 'pointer',
      marginTop: 10,
      width: '100%',
      transition: 'background-color 0.3s ease',
    },
    buttonDisabled: {
      opacity: 0.6,
      cursor: 'not-allowed',
      backgroundColor: '#6c757d',
    },
    downloadButton: { // Style for original file download button
      backgroundColor: '#6c5ce7', // A nice purple color
      marginTop: 10,
      padding: '8px 15px',
      fontSize: 14,
      color: 'white',
      border: 'none',
      borderRadius: 8,
      cursor: 'pointer',
      transition: 'background-color 0.3s ease',
      float: 'right', // Align to the right
    },
    downloadAnalysisButton: { // Style for analysis text download button
      backgroundColor: '#007bff', // Blue color
      marginTop: 10,
      padding: '8px 15px',
      fontSize: 14,
      color: 'white',
      border: 'none',
      borderRadius: 8,
      cursor: 'pointer',
      transition: 'background-color 0.3s ease',
      float: 'left', // Align to the left
    },
    error: {
      color: '#ffdddd',
      backgroundColor: 'rgba(255,0,0,0.3)',
      padding: 10,
      borderRadius: 5,
      marginTop: 15,
      fontWeight: 'bold',
      textAlign: 'center',
    },
    resultsContainer: {
      marginTop: 30,
      borderTop: '1px solid rgba(255,255,255,0.3)',
      paddingTop: 20,
    },
    resultCard: {
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      padding: 20,
      borderRadius: 10,
      marginBottom: 20,
      color: '#eee',
      boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
      transition: 'transform 0.2s ease-in-out',
      '&:hover': {
        transform: 'translateY(-3px)',
      },
      overflow: 'hidden', // Clear floats
      display: 'flex',
      flexDirection: 'column', // Arrange content vertically
    },
    resultCardContent: {
      flexGrow: 1, // Take up available space
    },
    resultCardButtons: {
      marginTop: 15,
      display: 'flex',
      justifyContent: 'space-between', // Space between the two buttons
      alignItems: 'center',
      clear: 'both', // Clear floats from above
    },
    resultHeading: {
      fontSize: 22,
      fontWeight: 'bold',
      marginBottom: 10,
      color: '#fff',
    },
    scoreColor: {
      color: '#ffeb3b',
      fontWeight: 'bold',
      fontSize: 18,
    },
    goodPointsColor: {
      color: '#8bc34a',
      fontWeight: 'bold',
    },
    badPointsColor: {
      color: '#ef5350',
      fontWeight: 'bold',
    },
  };

  const downloadAnalysisText = (result) => {
    if (!result) {
      alert("No analysis data to download.");
      return;
    }

    let content = `Resume Analysis Result for: ${result.filename || 'Unknown'}\n\n`;
    content += `Score: ${result.score}\n`;
    content += `Good Points: ${result.goodPoints}\n`;
    content += `Bad Points: ${result.badPoints}\n`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `${result.filename ? result.filename.replace(/\.[^/.]+$/, "") : 'resume_analysis'}_report.txt`; // Dynamic filename
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href); // Clean up the URL object
  };


  return (
    <div style={styles.appContainer}>
      <div style={styles.card}>
        <h1 style={styles.heading}>Resume Shortlisting Bot</h1>

        <textarea
          placeholder="Paste Job Description"
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          rows={8}
          style={styles.textarea}
        />

        <label htmlFor="file-upload" style={styles.fileInput}>
          <input
            id="file-upload"
            type="file"
            multiple
            onChange={handleFileChange}
            accept=".pdf,.docx"
            style={{ display: 'none' }}
          />
          Choose Resumes (PDF, DOCX)
        </label>
        {resumes.length > 0 && (
          <p style={{ marginBottom: 10, fontSize: 14, color: '#fff' }}>
            <strong>Selected:</strong> {resumes.map((f) => f.name).join(', ')}
          </p>
        )}

        <button
          onClick={analyzeResumes}
          disabled={loading || !jobDescription || resumes.length === 0}
          style={loading || !jobDescription || resumes.length === 0 ? { ...styles.button, ...styles.buttonDisabled } : styles.button}
        >
          {loading ? 'Analyzing...' : 'Analyze Resumes'}
        </button>

        {error && <p style={styles.error}>{error}</p>}

        {results.length > 0 && (
          <div style={styles.resultsContainer}>
            <h2 style={{ ...styles.resultHeading, textAlign: 'center' }}>Analysis Results</h2>
            {results.map((result, idx) => (
              <div key={idx} style={styles.resultCard}>
                <div style={styles.resultCardContent}>
                  <h3 style={{color: '#fff'}}>{result.filename || `Resume ${idx + 1}`}</h3>
                  {result.error ? (
                    <p style={styles.error}>{result.error}</p>
                  ) : (
                    <>
                      <p>
                        <strong>Score:</strong> <span style={styles.scoreColor}>{result.score}</span>
                      </p>
                      <p>
                        <strong>Good Points:</strong> <span style={styles.goodPointsColor}>{result.goodPoints}</span>
                      </p>
                      <p>
                        <strong>Bad Points:</strong> <span style={styles.badPointsColor}>{result.badPoints}</span>
                      </p>
                    </>
                  )}
                </div>
                {/* Buttons for individual result */}
                <div style={styles.resultCardButtons}>
                    {result.savedFilename && ( // Only show download button if savedFilename exists
                        <button
                            onClick={() => downloadOriginalFile(result.savedFilename, result.filename)}
                            style={styles.downloadButton}
                        >
                            Download Original File
                        </button>
                    )}
                    {!result.error && ( // Only show analysis download if no error in processing
                        <button
                            onClick={() => downloadAnalysisText(result)}
                            style={styles.downloadAnalysisButton}
                        >
                            Download Analysis Report
                        </button>
                    )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;