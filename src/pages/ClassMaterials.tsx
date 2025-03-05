import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import { getCachedDocument } from '../utils/firebaseUtils';
import { getStudentClassMaterials } from '../utils/classMaterialsUtils';
import { FaFilePdf, FaLink } from 'react-icons/fa';
import { useTranslation } from '../translations';
import { formatDateWithTime } from '../utils/dateUtils';
import toast from 'react-hot-toast';
import { styles } from '../styles/styleUtils';
import { ClassMaterial, Class, MonthYear } from '../types/interfaces';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const logMaterials = (message: string, data?: any) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[MATERIALS] ${message}`, data ? data : '');
  }
};

export const ClassMaterials = () => {
  const { currentUser } = useAuth();
  const { language } = useLanguage();
  const t = useTranslation(language);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [existingMaterials, setExistingMaterials] = useState<ClassMaterial[]>([]);
  const [selectedMaterial, setSelectedMaterial] = useState<ClassMaterial | null>(null);
  const [slidesUrl, setSlidesUrl] = useState<string | null>(null);
  const [loadingSlides, setLoadingSlides] = useState(false);
  const [selectedMonthYear, setSelectedMonthYear] = useState<MonthYear>(() => {
    const now = new Date();
    return { month: now.getMonth(), year: now.getFullYear() };
  });
  const [classesInfo, setClassesInfo] = useState<Record<string, Class>>({});

  // Fetch materials and class info
  useEffect(() => {
    const fetchData = async () => {
      if (!currentUser?.email) {
        setError(t.pleaseLogin);
        return;
      }

      try {
        setLoading(true);
        const fetchedMaterials = await getStudentClassMaterials(currentUser.email);
        
        console.log('Fetched materials:', fetchedMaterials);
        
        // Sort materials by date (most recent first)
        const sortedMaterials = fetchedMaterials.sort((a, b) => 
          b.classDate.getTime() - a.classDate.getTime()
        );
        
        console.log('Sorted materials:', sortedMaterials);
        
        setExistingMaterials(sortedMaterials);
        
        if (sortedMaterials.length > 0) {
          // Set initial month/year to match the most recent material
          const mostRecentDate = sortedMaterials[0].classDate;
          setSelectedMonthYear({
            month: mostRecentDate.getMonth(),
            year: mostRecentDate.getFullYear()
          });

          // Fetch class info for all materials
          const classIds = [...new Set(fetchedMaterials.map(m => m.classId))];
          console.log('Class IDs to fetch:', classIds);
          
          const classInfoMap: Record<string, Class> = {};
          
          for (const classId of classIds) {
            const classData = await getCachedDocument<Class>('classes', classId, { userId: currentUser.uid });
            console.log('Class data for', classId, ':', classData);
            if (classData) {
              classInfoMap[classId] = {
                ...classData,
                id: classId
              };
            }
          }
          
          console.log('Final class info map:', classInfoMap);
          setClassesInfo(classInfoMap);
          
          // Set initial selection to most recent material
          setSelectedMaterial(sortedMaterials[0]);
        }
      } catch (error) {
        console.error('Error fetching materials:', error);
        // Only set error if it's not a "no materials" case
        if (error instanceof Error && !error.message.includes('permission')) {
          setError(t.failedToLoad);
          toast.error(t.failedToLoad);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentUser, t]);

  // Get unique month/year combinations from materials
  const availableMonths = React.useMemo(() => {
    console.log('Calculating available months from materials:', existingMaterials);
    const months = new Set<string>();
    existingMaterials.forEach(material => {
      const date = material.classDate;
      months.add(`${date.getFullYear()}-${date.getMonth()}`);
    });
    const result = Array.from(months)
      .map(monthStr => {
        const [year, month] = monthStr.split('-').map(Number);
        return { month, year };
      })
      .sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
      });
    console.log('Available months:', result);
    return result;
  }, [existingMaterials]);

  // Filter materials by selected month
  const filteredMaterials = React.useMemo(() => {
    console.log('Filtering materials for month/year:', selectedMonthYear);
    const filtered = existingMaterials.filter(material => {
      const date = material.classDate;
      return date.getMonth() === selectedMonthYear.month && 
             date.getFullYear() === selectedMonthYear.year;
    }).sort((a, b) => b.classDate.getTime() - a.classDate.getTime());
    console.log('Filtered materials:', filtered);
    return filtered;
  }, [existingMaterials, selectedMonthYear]);

  // Handle month selection
  const handleMonthChange = (monthYear: string) => {
    const [year, month] = monthYear.split('-').map(Number);
    setSelectedMonthYear({ month, year });
    
    // Select the most recent material for the new month if current selection is not in this month
    if (selectedMaterial) {
      const selectedDate = selectedMaterial.classDate;
      if (selectedDate.getMonth() !== month || selectedDate.getFullYear() !== year) {
        const firstMaterialInMonth = filteredMaterials[0];
        if (firstMaterialInMonth) {
          setSelectedMaterial(firstMaterialInMonth);
        }
      }
    }
  };

  // Handle material selection
  const handleDateChange = (materialId: string) => {
    const material = existingMaterials.find(m => m.classDate.toISOString() === materialId);
    setSelectedMaterial(material || null);
  };

  // Fetch slides URL when selected material changes
  useEffect(() => {
    const fetchSlidesUrl = async () => {
      if (!selectedMaterial?.slides || !currentUser) {
        setSlidesUrl(null);
        return;
      }

      setLoadingSlides(true);
      try {
        logMaterials('Current user email:', currentUser.email);
        logMaterials('Selected material:', selectedMaterial);
        
        // The slides field already contains the full download URL
        setSlidesUrl(selectedMaterial.slides?.[0] || null);
      } catch (error) {
        console.error('Error setting slides URL:', error);
        if (error instanceof Error) {
          toast.error(`${t.failedToLoad}: ${error.message}`);
        } else {
          toast.error(t.failedToLoad);
        }
        setSlidesUrl(null);
      } finally {
        setLoadingSlides(false);
      }
    };

    fetchSlidesUrl();
  }, [selectedMaterial, currentUser, t]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4">
        <p className="text-red-500 text-center">{error}</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="container mx-auto px-4">
        <p className="text-center py-8">{t.pleaseLogin}</p>
      </div>
    );
  }

  if (existingMaterials.length === 0) {
    return (
      <div className="min-h-screen py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="card">
            <h1 className={styles.headings.h1}>{t.classMaterialsTitle}</h1>
            <p className="text-gray-500 text-center py-4">{t.noMaterialsFound}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-gray-50">
      <div className="py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className={styles.headings.h1}>{t.classMaterialsTitle}</h1>
        
        {/* Month and Date Selection */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-8">
          {/* Month Selection */}
          <div className="w-full sm:w-48">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t.selectMonthLabel}
            </label>
            <select
              value={`${selectedMonthYear.year}-${selectedMonthYear.month}`}
              onChange={(e) => handleMonthChange(e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            >
              {availableMonths.map(({ month, year }) => (
                <option key={`${year}-${month}`} value={`${year}-${month}`}>
                  {MONTHS[month]} {year}
                </option>
              ))}
            </select>
          </div>

          {/* Date Selection */}
          <div className="w-full sm:w-80">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t.selectDateLabel}
            </label>
            <select
              value={selectedMaterial?.classDate.toISOString() || ''}
              onChange={(e) => handleDateChange(e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            >
              {filteredMaterials.map((material) => {
                const classInfo = classesInfo[material.classId];
                return (
                  <option key={material.classDate.toISOString()} value={material.classDate.toISOString()}>
                    {formatDateWithTime(
                      material.classDate,
                      classInfo?.startTime,
                      classInfo?.endTime
                    )}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Selected Material Content */}
        {selectedMaterial && (
          <div className="space-y-6">
            {/* Slides */}
            

            {/* Links */}
            {selectedMaterial.links && selectedMaterial.links.length > 0 && (
              <div>
                <h3 className={styles.headings.h3}>{t.usefulLinks}</h3>
                <div className="space-y-2">
                  {selectedMaterial.links.map((link, index) => (
                    <a
                      key={index}
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-indigo-600 hover:text-indigo-900"
                    >
                      <FaLink className="mr-2" />
                      {link}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* No Materials Message */}
            {!selectedMaterial.slides && (!selectedMaterial.links || selectedMaterial.links.length === 0) && (
              <p className="text-gray-500 italic">{t.noMaterialsFound}</p>
            )}
          </div>
        )}

        {/* Materials List */}
        <div className="mt-8 space-y-8">
          {filteredMaterials.length === 0 ? (
            <div className="bg-white shadow-md rounded-lg p-6 text-center">
              <p className="text-gray-500">{t.noMaterialsAvailable}</p>
            </div>
          ) : (
            filteredMaterials.map((material) => (
              <div key={material.classId} className="bg-white shadow-md rounded-lg p-6">
                <div className="mb-4">
                  <h2 className={styles.headings.h2}>
                    {material.classDate.toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </h2>
                  <p className="text-gray-600 text-sm">
                    {material.classId}
                  </p>
                </div>
                
                {/* Slides */}
                {material.slides && (
                  <div>
                    {loadingSlides ? (
                      <div className="animate-pulse h-10 bg-gray-200 rounded"></div>
                    ) : slidesUrl ? (
                      <a
                        href={material.slides?.[0] || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        <FaFilePdf className="mr-2" />
                        {t.downloadSlides}
                      </a>
                    ) : null}
                  </div>
                )}

                {/* Links */}
                {material.links && material.links.length > 0 && (
                  <div className="mt-6">
                    <h3 className={styles.headings.h3}>{t.usefulLinks}</h3>
                    <ul className="mt-2 space-y-2">
                      {material.links.map((link, index) => (
                        <li key={index}>
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-900 flex items-center"
                          >
                            <FaLink className="mr-2" />
                            {link}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ClassMaterials; 