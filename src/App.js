import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Send,
  FileText,
  X,
  MessageSquare,
  Loader2,
  AlertCircle,
  Moon,
  Sun,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Toaster, toast } from 'react-hot-toast';
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';

export default function PDFChatbot() {
  const [darkMode, setDarkMode] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [messages, setMessages] = useState([
    {
      type: 'bot',
      text: "Hi! Upload a document to get started. I support PDF, Word, TXT, and more!",
    },
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [uploadedDocs, setUploadedDocs] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [docContent, setDocContent] = useState(null);
  const [docType, setDocType] = useState(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingContent, setIsLoadingContent] = useState(false);

  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const toggleDarkMode = () => setDarkMode((s) => !s);

  const handleFileUpload = async (files) => {
    if (!files || files.length === 0) return;
    const file = files[0];

    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/plain',
      'text/csv',
      'application/json',
    ];

    const fileExtension = file.name.split('.').pop().toLowerCase();
    const textExtensions = ['txt', 'csv', 'json', 'md', 'log', 'xml', 'html', 'css', 'js', 'py', 'java', 'cpp', 'c', 'h'];
    
    if (!allowedTypes.includes(file.type) && !textExtensions.includes(fileExtension)) {
      toast.error('Please upload a supported file type.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      setIsProcessing(true);

      const res = await fetch('http://localhost:5000/api/upload', {
        method: 'POST',
        body: formData,
        mode: 'cors',
      });

      let data = null;
      try {
        data = await res.json();
      } catch (err) {
        console.error('Upload: failed to parse JSON response', err);
      }

      if (!res.ok) {
        console.error('Upload error:', data || res.statusText || res.status);
        toast.error(
          (data && data.error) || 'Upload failed: ' + (res.statusText || res.status)
        );
        return;
      }

      const backendId =
        data?.document_id || data?.documentId || data?.doc_id || null;
      if (!backendId) {
        console.warn('Upload succeeded but server did not return a document id:', data);
        toast.error('Upload completed but server did not return a document id.');
        return;
      }

      const fileUrl = URL.createObjectURL(file);
      const newDoc = {
        id: Date.now(),
        name: file.name,
        size: (file.size / 1024).toFixed(2) + ' KB',
        file,
        url: fileUrl,
        backendId,
      };

      setUploadedDocs((prev) => [...prev, newDoc]);
      
      setTimeout(() => {
        selectDocument(newDoc);
      }, 150);
      //If Wan the file upload to be shown in the chat then unlock this code
      //setMessages((prev) => [
       // ...prev,
       // { type: 'bot', text: `✅ "${file.name}" uploaded successfully.` },
      //]);
      toast.success(`"${file.name}" uploaded`);
    } catch (err) {
      console.error('Upload exception:', err);
      toast.error('Server error: ' + (err.message || err));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer?.files;
    if (files) handleFileUpload(files);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const removeDocument = async (id) => {
    const docToRemove = uploadedDocs.find((d) => d.id === id);
    if (!docToRemove) return;

    const confirmDelete = window.confirm(`Are you sure you want to delete "${docToRemove.name}"?`);
    if (!confirmDelete) return;

    if (!docToRemove.backendId) {
      toast.error('Document not yet processed by server. Try again in a moment.');
      return;
    }

    const toastId = toast.loading(`Removing "${docToRemove.name}"...`);

    try {
      const res = await fetch(`http://localhost:5000/api/upload/${docToRemove.backendId}`, {
        method: 'DELETE',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      let data = null;
      try {
        data = await res.json();
      } catch (err) {
        // Non-JSON response ok
      }

      if (!res.ok) {
        console.error('Delete error:', data || res.statusText || res.status);
        toast.dismiss(toastId);
        toast.error((data && data.error) || `Failed to delete: ${res.statusText || res.status}`);
        return;
      }

      try {
        if (docToRemove.url) URL.revokeObjectURL(docToRemove.url);
      } catch (e) {
        console.warn('Failed to revoke object URL', e);
      }

      setUploadedDocs((prev) => prev.filter((d) => d.id !== id));
      if (selectedDoc?.id === id) {
        setSelectedDoc(null);
        setDocContent(null);
        setDocType(null);
      }

      toast.dismiss(toastId);
      toast.success(`"${docToRemove.name}" deleted successfully.`);
    } catch (err) {
      console.error('Delete exception:', err);
      toast.dismiss(toastId);
      toast.error('Network error: ' + (err.message || err));
    }
  };

  const selectDocument = async (doc) => {
    setSelectedDoc(doc);
    setDocContent(null);
    setDocType(null);
    setIsLoadingContent(true);

    const fileName = doc.name.toLowerCase();

    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      if (fileName.endsWith('.pdf')) {
        setDocType('pdf');
        setDocContent(true);
        setIsLoadingContent(false);
      }
      else if (fileName.match(/\.(docx?)$/i)) {
        setDocType('docx');
        
        try {
          const arrayBuffer = await doc.file.arrayBuffer();
          const result = await mammoth.convertToHtml({ 
            arrayBuffer,
            convertImage: mammoth.images.imgElement(function(image) {
              return image.read("base64").then(function(imageBuffer) {
                return {
                  src: "data:" + image.contentType + ";base64," + imageBuffer
                };
              });
            })
          });
          
          setDocContent(result.value);
          setIsLoadingContent(false);
        } catch (err) {
          console.error('Error loading Word document:', err);
          throw err;
        }
      }
      else if (fileName.match(/\.(xlsx?|xls)$/i)) {
        setDocType('excel');
        const arrayBuffer = await doc.file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        
        const allSheets = {};
        workbook.SheetNames.forEach((sheetName) => {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          allSheets[sheetName] = jsonData;
        });
        
        setDocContent(allSheets);
        setIsLoadingContent(false);
      }
      else if (fileName.match(/\.(txt|json|md|log|xml|html|css|js|py|java|cpp|c|h)$/i)) {
        setDocType('text');
        const text = await doc.file.text();
        setDocContent(text);
        setIsLoadingContent(false);
      }
      else if (fileName.endsWith('.csv')) {
        setDocType('csv');
        const arrayBuffer = await doc.file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        setDocContent({ 'CSV Data': jsonData });
        setIsLoadingContent(false);
      }
      else {
        setDocType('unsupported');
        setIsLoadingContent(false);
      }
    } catch (err) {
      console.error('Error loading document:', err);
      toast.error('Failed to load document: ' + (err.message || 'Unknown error'));
      setDocType('error');
      setDocContent('Error: ' + (err.message || 'Failed to load document'));
      setIsLoadingContent(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;
    if (!selectedDoc) {
      toast('Please upload & select a document first', { icon: '📎' });
      return;
    }

    if (!selectedDoc.backendId) {
      toast.error('Selected document is not yet processed by the server.');
      return;
    }

    setMessages((prev) => [...prev, { type: 'user', text: inputMessage }]);
    const userQuestion = inputMessage;
    setInputMessage('');
    setIsSending(true);

    setMessages((prev) => [...prev, { type: 'bot', text: '' }]);

    try {
      const response = await fetch('http://localhost:5000/api/chat', {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: selectedDoc.backendId,
          question: userQuestion,
          session_id: 'default',
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.substring(6);
              const data = JSON.parse(jsonStr);

              if (data.type === 'token') {
                setMessages((prev) => {
                  const updated = [...prev];
                  const lastMsg = updated[updated.length - 1];
                  if (lastMsg && lastMsg.type === 'bot') {
                    updated[updated.length - 1] = {
                      ...lastMsg,
                      text: lastMsg.text + data.content,
                    };
                  }
                  return updated;
                });
              } else if (data.type === 'sources') {
                console.log('Sources:', data.sources);
              } else if (data.type === 'done') {
                console.log('Streaming complete');
              }
            } catch (e) {
              console.error('Failed to parse SSE message:', e);
            }
          }
        }
      }
    } catch (err) {
      console.error('Chat stream error:', err);
      setMessages((prev) => {
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        if (lastMsg && lastMsg.type === 'bot' && !lastMsg.text) {
          updated[updated.length - 1] = {
            type: 'bot',
            text: '❌ Network error: ' + (err.message || err),
          };
        } else {
          updated.push({
            type: 'bot',
            text: '❌ Network error: ' + (err.message || err),
          });
        }
        return updated;
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatMessage = (text) => {
    const lines = text.split('\n');
    const elements = [];
    let listItems = [];
    let inList = false;
    let tableRows = [];
    let inTable = false;

    lines.forEach((line, idx) => {
      const boldRegex = /\*\*(.+?)\*\*/g;
      const bulletMatch = line.match(/^[\s]*[-*•]\s+(.+)/);
      const numberedMatch = line.match(/^[\s]*(\d+)\.\s+(.+)/);
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      const tableMatch = line.match(/^\|(.+)\|$/);
      const tableSeparator = line.match(/^\|[\s:-]+\|$/);

      if (tableMatch || tableSeparator) {
        if (inList && listItems.length > 0) {
          elements.push(
            <ul key={`list-${idx}`} className="list-disc ml-4 my-2 space-y-1">
              {listItems}
            </ul>
          );
          listItems = [];
          inList = false;
        }

        if (!tableSeparator) {
          inTable = true;
          const cells = line
            .split('|')
            .slice(1, -1)
            .map((cell) => cell.trim());
          tableRows.push({ cells, idx, isHeader: tableRows.length === 0 });
        }
      } else {
        if (inTable && tableRows.length > 0) {
          const headerRow = tableRows[0];
          const dataRows = tableRows.slice(1);

          elements.push(
            <div key={`table-${idx}`} className="my-3 overflow-x-auto">
              <table className={`w-full border-collapse text-sm ${darkMode ? 'border-gray-600' : 'border-gray-300'}`}>
                <thead className={darkMode ? 'bg-gray-700' : 'bg-gray-100'}>
                  <tr>
                    {headerRow.cells.map((cell, i) => (
                      <th
                        key={i}
                        className={`border px-3 py-2 text-left font-semibold ${darkMode ? 'border-gray-600' : 'border-gray-300'}`}
                        dangerouslySetInnerHTML={{ __html: cell.replace(boldRegex, '<strong>$1</strong>') }}
                      />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dataRows.map((row, rowIdx) => (
                    <tr key={rowIdx} className={darkMode ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'}>
                      {row.cells.map((cell, cellIdx) => (
                        <td
                          key={cellIdx}
                          className={`border px-3 py-2 ${darkMode ? 'border-gray-600' : 'border-gray-300'}`}
                          dangerouslySetInnerHTML={{ __html: cell.replace(boldRegex, '<strong>$1</strong>') }}
                        />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
          tableRows = [];
          inTable = false;
        }

        if (headingMatch) {
          if (inList && listItems.length > 0) {
            elements.push(
              <ul key={`list-${idx}`} className="list-disc ml-4 my-2 space-y-1">
                {listItems}
              </ul>
            );
            listItems = [];
            inList = false;
          }

          const level = headingMatch[1].length;
          const content = headingMatch[2].replace(boldRegex, '<strong>$1</strong>');
          const HeadingTag = `h${level}`;
          const sizeClasses = {
            1: 'text-xl font-bold mt-4 mb-2',
            2: 'text-lg font-bold mt-3 mb-2',
            3: 'text-base font-semibold mt-2 mb-1',
            4: 'text-sm font-semibold mt-2 mb-1',
            5: 'text-sm font-medium mt-1 mb-1',
            6: 'text-xs font-medium mt-1 mb-1',
          };

          elements.push(
            React.createElement(
              HeadingTag,
              { key: idx, className: `${sizeClasses[level]} ${darkMode ? 'text-gray-100' : 'text-gray-900'}`, dangerouslySetInnerHTML: { __html: content } },
            )
          );
        } else if (bulletMatch) {
          inList = true;
          const content = bulletMatch[1].replace(boldRegex, '<strong>$1</strong>');
          listItems.push(
            <li key={idx} className="ml-4" dangerouslySetInnerHTML={{ __html: content }} />
          );
        } else if (numberedMatch) {
          inList = true;
          const content = numberedMatch[2].replace(boldRegex, '<strong>$1</strong>');
          listItems.push(
            <li key={idx} className="ml-4" dangerouslySetInnerHTML={{ __html: content }} />
          );
        } else {
          if (inList && listItems.length > 0) {
            elements.push(
              <ul key={`list-${idx}`} className="list-disc ml-4 my-2 space-y-1">
                {listItems}
              </ul>
            );
            listItems = [];
            inList = false;
          }

          if (line.trim()) {
            const processedLine = line.replace(boldRegex, '<strong>$1</strong>');
            elements.push(
              <p key={idx} className="my-1" dangerouslySetInnerHTML={{ __html: processedLine }} />
            );
          } else {
            elements.push(<br key={idx} />);
          }
        }
      }
    });

    if (inTable && tableRows.length > 0) {
      const headerRow = tableRows[0];
      const dataRows = tableRows.slice(1);

      elements.push(
        <div key="table-final" className="my-3 overflow-x-auto">
          <table className={`w-full border-collapse text-sm ${darkMode ? 'border-gray-600' : 'border-gray-300'}`}>
            <thead className={darkMode ? 'bg-gray-700' : 'bg-gray-100'}>
              <tr>
                {headerRow.cells.map((cell, i) => (
                  <th
                    key={i}
                    className={`border px-3 py-2 text-left font-semibold ${darkMode ? 'border-gray-600' : 'border-gray-300'}`}
                    dangerouslySetInnerHTML={{ __html: cell.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {dataRows.map((row, rowIdx) => (
                <tr key={rowIdx} className={darkMode ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'}>
                  {row.cells.map((cell, cellIdx) => (
                    <td
                      key={cellIdx}
                      className={`border px-3 py-2 ${darkMode ? 'border-gray-600' : 'border-gray-300'}`}
                      dangerouslySetInnerHTML={{ __html: cell.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (listItems.length > 0) {
      elements.push(
        <ul key="list-final" className="list-disc ml-4 my-2 space-y-1">
          {listItems}
        </ul>
      );
    }

    return elements;
  };

  const renderExcelSheet = (sheetName, data) => {
    if (!data || data.length === 0) {
      return <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>No data in this sheet</p>;
    }

    const headers = data[0];
    const rows = data.slice(1);

    return (
      <div className="mb-6">
        <h3 className={`text-lg font-semibold mb-3 ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
          {sheetName}
        </h3>
        <div className="overflow-x-auto">
          <table className={`w-full border-collapse text-sm ${darkMode ? 'border-gray-600' : 'border-gray-300'}`}>
            <thead className={darkMode ? 'bg-gray-700' : 'bg-gray-100'}>
              <tr>
                {headers.map((header, i) => (
                  <th
                    key={i}
                    className={`border px-3 py-2 text-left font-semibold ${darkMode ? 'border-gray-600 text-gray-100' : 'border-gray-300 text-gray-900'}`}
                  >
                    {header || `Column ${i + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr key={rowIdx} className={darkMode ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'}>
                  {headers.map((_, cellIdx) => (
                    <td
                      key={cellIdx}
                      className={`border px-3 py-2 ${darkMode ? 'border-gray-600 text-gray-200' : 'border-gray-300 text-gray-800'}`}
                    >
                      {row[cellIdx] !== undefined ? String(row[cellIdx]) : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const theme = {
    bg: darkMode ? 'bg-gray-900' : 'bg-gradient-to-br from-blue-50 to-indigo-100',
    cardBg: darkMode ? 'bg-gray-800' : 'bg-white',
    headerBg: darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200',
    text: darkMode ? 'text-gray-100' : 'text-gray-800',
    textSecondary: darkMode ? 'text-gray-400' : 'text-gray-500',
    border: darkMode ? 'border-gray-700' : 'border-gray-200',
    inputBg: darkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900',
    docBg: darkMode ? 'bg-gray-700' : 'bg-gray-50',
    messageBotBg: darkMode ? 'bg-gray-700' : 'bg-gray-100',
  };

  const msgVariants = { hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } };
  const cardHover = { scale: 1.02, transition: { duration: 0.12 } };

  const TypingDots = () => (
    <div className="flex items-center gap-1">
      <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
      <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse delay-150" />
      <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse delay-300" />
      <style>{`.delay-150{animation-delay:.15s}.delay-300{animation-delay:.3s}`}</style>
    </div>
  );

  return (
    <div className={`flex flex-col h-screen transition-colors duration-500 ${theme.bg}`}>
      <Toaster position="top-right" />

      <header className={`${theme.headerBg} shadow-md border-b transition-colors duration-300`}>
        <div className="max-w-full mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <MessageSquare className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className={`text-2xl font-bold ${theme.text}`}>FingerTips Chatbot</h1>
              <p className={`text-sm ${theme.textSecondary}`}>PDF, Word, TXT & more</p>
            </div>
          </div>

          <motion.button
            onClick={toggleDarkMode}
            whileTap={{ scale: 0.95 }}
            className={`p-2 rounded-lg ${darkMode ? 'bg-gray-700 text-yellow-400' : 'bg-gray-100 text-gray-700'} hover:scale-110 transition-all`}
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </motion.button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden w-full mx-auto p-4 gap-4 transition-all duration-300">
        {!focusMode && (
          <motion.aside
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.24 }}
            className={`w-56 ${theme.cardBg} rounded-xl shadow-lg p-3 flex flex-col`}
          >
            <h2 className={`text-base font-semibold ${theme.text} mb-2 flex items-center gap-2`}>
              <FileText className="w-4 h-4 text-indigo-600" />
              Documents
            </h2>

            <motion.div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              whileHover={{ scale: 1.01 }}
              className={`border-2 border-dashed rounded-lg p-3 mb-3 cursor-pointer transition-all ${isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400'}`}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.json,.md,.log"
                onChange={(e) => handleFileUpload(e.target.files)}
              />
              <div className="flex flex-col items-center text-center">
                <Upload className={`w-6 h-6 mb-1 ${isDragging ? 'text-indigo-600' : 'text-gray-400'}`} />
                <p className={`text-xs font-medium ${theme.text}`}>{isDragging ? 'Drop here' : 'Upload Doc'}</p>
              </div>
            </motion.div>

            {isProcessing && (
              <div className="flex items-center gap-2 text-indigo-600 mb-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs">Processing...</span>
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-2">
              {uploadedDocs.length === 0 ? (
                <div className={`text-center py-6 ${theme.textSecondary}`}>
                  <FileText className="w-10 h-10 mx-auto mb-1 opacity-50" />
                  <p className="text-xs">No documents</p>
                </div>
              ) : (
                uploadedDocs.map((doc) => (
                  <motion.div
                    key={doc.id}
                    whileHover={cardHover}
                    className={`rounded-md p-2 border cursor-pointer flex items-center justify-between transition-all duration-200 ${selectedDoc?.id === doc.id ? 'bg-indigo-100 border-indigo-400' : `${theme.docBg} border-gray-200`}`}
                    onClick={() => selectDocument(doc)}
                  >
                    <div className="min-w-0">
                      <p className={`text-sm font-medium truncate ${selectedDoc?.id === doc.id ? 'text-black' : theme.text}`}>{doc.name}</p>
                      <p className={`text-xs ${selectedDoc?.id === doc.id ? 'text-gray-700' : theme.textSecondary}`}>{doc.size}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeDocument(doc.id);
                      }}
                      className={`ml-2 ${selectedDoc?.id === doc.id ? 'text-gray-700 hover:text-red-500' : `${theme.textSecondary} hover:text-red-500`}`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </motion.div>
                ))
              )}
            </div>
          </motion.aside>
        )}

        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
          className={`${focusMode ? 'hidden lg:flex lg:flex-1' : 'flex-1'} ${theme.cardBg} rounded-xl shadow-lg flex flex-col overflow-hidden`}
        >
          {selectedDoc ? (
            <>
              <div className={`border-b ${theme.border} p-3 flex items-center justify-between ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-indigo-600" />
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${theme.text} truncate`}>{selectedDoc.name}</p>
                    <p className={`text-xs ${theme.textSecondary}`}>{selectedDoc.size}</p>
                  </div>
                </div>
                <button
                  onClick={() => window.open(selectedDoc.url, '_blank')}
                  className="text-xs px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                >
                  Open
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                {isLoadingContent ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3">
                    <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                    <p className={`text-sm ${theme.textSecondary}`}>Loading document...</p>
                  </div>
                ) : docType === 'pdf' ? (
                  <iframe 
                    src={`${selectedDoc.url}#toolbar=1&navpanes=1&scrollbar=1`}
                    className="w-full h-full border-0 rounded-lg" 
                    title="PDF Viewer"
                  />
                ) : docType === 'docx' ? (
                  <div 
                    className={`w-full h-full overflow-y-auto p-8 ${darkMode ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'}`}
                    style={{
                      fontFamily: 'Georgia, "Times New Roman", serif',
                      fontSize: '16px',
                      lineHeight: '1.8'
                    }}
                  >
                    <style>{`
                      .doc-content img {
                        max-width: 100%;
                        height: auto;
                        margin: 20px 0;
                        border-radius: 8px;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                      }
                      .doc-content p {
                        margin: 12px 0;
                      }
                      .doc-content h1, .doc-content h2, .doc-content h3 {
                        margin-top: 24px;
                        margin-bottom: 12px;
                        font-weight: bold;
                      }
                      .doc-content ul, .doc-content ol {
                        margin: 12px 0;
                        padding-left: 30px;
                      }
                      .doc-content li {
                        margin: 6px 0;
                      }
                      .doc-content table {
                        border-collapse: collapse;
                        width: 100%;
                        margin: 20px 0;
                      }
                      .doc-content table td, .doc-content table th {
                        border: 1px solid ${darkMode ? '#4b5563' : '#d1d5db'};
                        padding: 8px 12px;
                      }
                      .doc-content table th {
                        background-color: ${darkMode ? '#374151' : '#f3f4f6'};
                        font-weight: bold;
                      }
                    `}</style>
                    <div 
                      className="doc-content"
                      dangerouslySetInnerHTML={{ __html: docContent }}
                      style={{
                        maxWidth: '800px',
                        margin: '0 auto'
                      }}
                    />
                  </div>
                ) : docType === 'excel' || docType === 'csv' ? (
                  <div className={`w-full h-full overflow-auto p-6 ${darkMode ? 'bg-gray-900' : 'bg-white'}`}>
                    {docContent && Object.keys(docContent).map((sheetName) => (
                      <div key={sheetName}>
                        {renderExcelSheet(sheetName, docContent[sheetName])}
                      </div>
                    ))}
                  </div>
                ) : docType === 'text' ? (
                  <div className={`w-full h-full overflow-auto p-6 ${darkMode ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'}`}>
                    <pre className={`text-sm whitespace-pre-wrap font-mono ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                      {docContent}
                    </pre>
                  </div>
                ) : docType === 'error' ? (
                  <div className="flex items-center justify-center h-full text-center">
                    <div>
                      <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-500" />
                      <p className={`text-lg font-semibold mb-2 ${theme.text}`}>Error Loading Document</p>
                      <p className={`text-sm ${theme.textSecondary}`}>There was a problem loading this file</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-center">
                    <div>
                      <FileText className="w-16 h-16 mx-auto mb-4 opacity-40" />
                      <p className={`text-lg font-semibold mb-2 ${theme.text}`}>Preview not available</p>
                      <p className={`text-sm mb-4 ${theme.textSecondary}`}>This file type cannot be previewed</p>
                      <button
                        onClick={() => window.open(selectedDoc.url, '_blank')}
                        className="mt-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
                      >
                        Open in new tab
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className={`flex-1 flex items-center justify-center ${theme.textSecondary}`}>
              <div className="text-center">
                <FileText className="w-20 h-20 mx-auto mb-4 opacity-40" />
                <p className="text-lg font-medium">No document selected</p>
                <p className="text-sm mt-1">Upload and select a document to preview it here</p>
              </div>
            </div>
          )}
        </motion.section>

        <div className={`${focusMode ? 'flex flex-1' : 'hidden lg:flex lg:w-80'}`}>
          <motion.aside
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.24 }}
            className={`${theme.cardBg} rounded-xl shadow-lg flex flex-col overflow-hidden w-full`}
          >
            <div className={`flex items-center justify-between border-b ${theme.border} ${darkMode ? 'bg-gray-700' : 'bg-gray-50'} p-3`}>
              <h3 className={`text-sm font-semibold ${theme.text} flex items-center gap-2`}>
                <MessageSquare className="w-4 h-4 text-indigo-600" />
                Chat Assistant
              </h3>
              {focusMode && (
                <button onClick={() => setFocusMode(false)} className="p-1 hover:bg-gray-200 rounded">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <AnimatePresence initial={false}>
                {messages.map((m, i) => (
                  <motion.div
                    key={i}
                    initial="hidden"
                    animate="visible"
                    variants={msgVariants}
                    transition={{ duration: 0.18 }}
                    className={`flex ${m.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-full rounded-2xl px-4 py-2 ${m.type === 'user' ? 'bg-indigo-600 text-white' : `${theme.messageBotBg}`}`}>
                      <div className={`text-sm ${m.type === 'user' ? 'text-white' : theme.text}`}>
                        {m.type === 'user' ? (
                          <p className="whitespace-pre-wrap">{m.text}</p>
                        ) : (
                          <div>{formatMessage(m.text)}</div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {isSending && (
                <div className="flex justify-start">
                  <div className={`${theme.messageBotBg} rounded-2xl px-4 py-2 flex items-center gap-3`}>
                    <TypingDots />
                    <span className={`text-sm ${theme.textSecondary}`}>Thinking...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className={`border-t ${theme.border} p-3`}>
              <div className="flex gap-2">
                <textarea
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about the document..."
                  className={`flex-1 resize-none border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${theme.inputBg}`}
                  rows="2"
                />
                <motion.button
                  onClick={handleSendMessage}
                  disabled={!inputMessage.trim() || isSending}
                  whileTap={{ scale: 0.97 }}
                  className="bg-indigo-600 text-white px-3 rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center"
                >
                  <Send className="w-4 h-4" />
                </motion.button>
              </div>
              <p className={`text-xs ${theme.textSecondary} mt-2 flex items-center gap-1`}>
                <AlertCircle className="w-3 h-3" /> FingerTips
              </p>
            </div>
          </motion.aside>
        </div>
      </div>

      {!focusMode && (
        <motion.button
          onClick={() => setFocusMode(true)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          aria-label="Expand chat"
          className="fixed bottom-6 right-6 z-50 bg-indigo-600 text-white p-4 rounded-full shadow-2xl hover:bg-indigo-700 transition-all lg:flex"
        >
          <MessageSquare className="w-6 h-6" />
        </motion.button>
      )}

      {focusMode && (
        <motion.button
          onClick={() => setFocusMode(false)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          aria-label="Show document"
          className="fixed bottom-6 left-6 z-50 bg-gray-600 text-white p-4 rounded-full shadow-2xl hover:bg-gray-700 transition-all lg:flex"
        >
          <FileText className="w-6 h-6" />
        </motion.button>
      )}
    </div>
  );
}