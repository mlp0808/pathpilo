import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Alert,
  Animated,
  Easing,
  Keyboard,
  FlatList,
  ScrollView,
  Dimensions,
  PanResponder,
  KeyboardAvoidingView,
  Platform,
  InteractionManager,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Svg, { G, Rect, Path, Circle, Ellipse, Line } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from './src/api/client';
import { User, Company, Job, Service } from './src/types';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

type RootStackParamList = {
  Login: undefined;
  Companies: { user: User };
  CompanyTabs: { company: Company; user: User };
  DayView: { date: string; company: Company; user: User };
};

// Icon components
const OverviewIcon = ({ color }: { color: string }) => (
  <Svg width="18" height="18" viewBox="0 0 18 18">
    <G transform="translate(-28 -138)">
      <G>
        <Rect x="28.5" y="138.5" width="7" height="7" rx={1.5} fill="none" stroke={color} strokeWidth="1"/>
        <Rect x="28" y="148" width="8" height="8" rx={2} fill={color}/>
        <Rect x="38" y="138" width="8" height="8" rx={2} fill={color}/>
        <Rect x="38.5" y="148.5" width="7" height="7" rx={1.5} fill="none" stroke={color} strokeWidth="1"/>
      </G>
    </G>
  </Svg>
);

const CalendarIcon = ({ color }: { color: string }) => (
  <Svg width="20" height="22" viewBox="0 0 20.306 22">
    <G transform="translate(1.306 1)">
      <Path d="M5,0V4" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
      <Path d="M13,0V4" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
      <Rect x="-0.306" y="2" width="18" height="18" rx={2} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
      <Path d="M-0.306,8H17.694" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
    </G>
  </Svg>
);

const TodayIcon = ({ color }: { color: string }) => (
  <Svg width="18" height="21" viewBox="0 0 18 21">
    <Path d="M9,12h3.75M9,15h3.75M9,18h3.75m3,.75H18a2.25,2.25,0,0,0,2.25-2.25V6.108a2.177,2.177,0,0,0-1.976-2.192q-.561-.047-1.123-.08m-5.8,0a2.242,2.242,0,0,0-.1.664.75.75,0,0,0,.75.75h4.5a.75.75,0,0,0,.75-.75,2.25,2.25,0,0,0-.1-.664m-5.8,0A2.251,2.251,0,0,1,13.5,2.25H15a2.25,2.25,0,0,1,2.15,1.586m-5.8,0q-.564.035-1.124.08A2.177,2.177,0,0,0,8.25,6.108V8.25m0,0H4.875A1.125,1.125,0,0,0,3.75,9.375v11.25A1.125,1.125,0,0,0,4.875,21.75h9.75a1.125,1.125,0,0,0,1.125-1.125V9.375A1.125,1.125,0,0,0,14.625,8.25ZM6.75,12h.008v.008H6.75Zm0,3h.008v.008H6.75Zm0,3h.008v.008H6.75Z" transform="translate(-3 -1.5)" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
  </Svg>
);

// Job detail icons
const MailIcon = () => (
  <Svg width="14.921" height="11.165" viewBox="0 0 14.921 11.165">
    <G transform="translate(0.69 0.5)">
      <Rect width="13.553" height="10.165" rx="2" fill="none" stroke="#BFD1C5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1"/>
      <Path d="M15.54,7,9.468,10.859a1.313,1.313,0,0,1-1.395,0L2,7" transform="translate(-2 -4.969)" fill="none" stroke="#BFD1C5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1"/>
    </G>
  </Svg>
);

const PhoneIcon = () => (
  <Svg width="14.466" height="14.493" viewBox="0 0 14.466 14.493">
    <Path d="M15.576,12.1v2.031A1.354,1.354,0,0,1,14.1,15.486a13.4,13.4,0,0,1-5.843-2.078A13.2,13.2,0,0,1,4.2,9.346a13.4,13.4,0,0,1-2.078-5.87A1.354,1.354,0,0,1,3.465,2H5.5A1.354,1.354,0,0,1,6.85,3.164a8.693,8.693,0,0,0,.474,1.9,1.354,1.354,0,0,1-.3,1.429l-.86.86a10.832,10.832,0,0,0,4.062,4.062l.86-.86a1.354,1.354,0,0,1,1.429-.3,8.693,8.693,0,0,0,1.9.474A1.354,1.354,0,0,1,15.576,12.1Z" transform="translate(-1.611 -1.5)" fill="none" stroke="#BFD1C5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1"/>
  </Svg>
);

const LocationIcon = () => (
  <Svg width="14.436" height="17.829" viewBox="0 0 14.436 17.829">
    <G transform="translate(0.5 0.5)">
      <Path d="M17.436,8.718c0,4.193-4.651,8.56-6.213,9.908a.84.84,0,0,1-1.009,0C8.651,17.278,4,12.911,4,8.718a6.718,6.718,0,0,1,13.436,0" transform="translate(-4 -2)" fill="none" stroke="#BFD1C5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1"/>
      <Circle cx="2.519" cy="2.519" r="2.519" transform="translate(4.177 4.199)" fill="none" stroke="#BFD1C5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1"/>
    </G>
  </Svg>
);

const TimeIcon = () => (
  <Svg width="16" height="17" viewBox="0 0 16 17">
    <G transform="translate(0.5 0.93)">
      <Ellipse cx="7.5" cy="8" rx="7.5" ry="8" transform="translate(0 -0.43)" fill="none" stroke="#BFD1C5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1"/>
      <Path d="M12,6v4.535l3.023,1.512" transform="translate(-4.121 -2.977)" fill="none" stroke="#BFD1C5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1"/>
    </G>
  </Svg>
);

const DateIcon = () => (
  <Svg width="14" height="16.5" viewBox="0 0 14 16.5">
    <G transform="translate(0.34 0.5)">
      <Path d="M8,2V4.95" transform="translate(-4.087 -2)" fill="none" stroke="#BFD1C5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1"/>
      <Path d="M16,2V4.95" transform="translate(-6.187 -2)" fill="none" stroke="#BFD1C5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1"/>
      <Rect width="13" height="14" rx="2" transform="translate(0.16 1.5)" fill="none" stroke="#BFD1C5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1"/>
      <Path d="M3,10H15.934" transform="translate(-2.774 -4.1)" fill="none" stroke="#BFD1C5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1"/>
    </G>
  </Svg>
);

const TimerIcon = () => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#BFD1C5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Line x1="10" x2="14" y1="2" y2="2"/>
    <Line x1="12" x2="15" y1="14" y2="11"/>
    <Circle cx="12" cy="14" r="8"/>
  </Svg>
);

function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  // Animation values
  const fadeAnim = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(50))[0];
  const buttonScale = useState(new Animated.Value(1))[0];

  useEffect(() => {
    // Fade in and slide up animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleLogin = async () => {
    console.log('🔐 Login attempt started');
    console.log('📧 Email:', email);
    console.log('🔒 Password length:', password.length);

    if (!email || !password) {
      console.log('❌ Validation failed: Missing email or password');
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setIsLoading(true);
    console.log('⏳ Setting loading state to true');

    // Button press animation
    Animated.sequence([
      Animated.timing(buttonScale, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(buttonScale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    try {
      console.log('🌐 Making API call to /auth/login');
      console.log('📡 API Base URL:', apiClient.defaults.baseURL);

      const response = await apiClient.post('/auth/login', {
        email,
        password,
      });

      console.log('✅ API call successful');
      console.log('📦 Response status:', response.status);
      console.log('📦 Response data:', response.data);

      const { user, token } = response.data;

      console.log('👤 User data:', user);
      console.log('🎫 Token received (length):', token.length);

      // Store token
      console.log('💾 Storing auth token...');
      await AsyncStorage.setItem('authToken', token);
      console.log('✅ Token stored successfully');

      // Navigate to companies screen with user data
      console.log('🧭 Navigating to Companies screen...');
      navigation.replace('Companies', { user });
      console.log('✅ Navigation successful');

    } catch (error: any) {
      console.error('❌ Login error occurred:', error);
      console.error('❌ Error details:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        config: error.config,
      });

      let errorMessage = 'Login failed. Please try again.';
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = `Connection error: ${error.message}`;
      }

      Alert.alert('Error', errorMessage);
    } finally {
      console.log('🏁 Setting loading state to false');
      setIsLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.container}>
        <Animated.View
          style={[
            styles.loginContainer,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <Text style={styles.title}>Welcome to PathPilo</Text>
          <Text style={styles.subtitle}>Sign in to your account</Text>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Enter your email"
            placeholderTextColor="#19343480"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            selectionColor="#193434"
            underlineColorAndroid="transparent"
          />
          </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              placeholderTextColor="#19343480"
              secureTextEntry={!passwordVisible}
              autoCapitalize="none"
              autoCorrect={false}
              selectionColor="#193434"
              underlineColorAndroid="transparent"
            />
            <TouchableOpacity
              style={styles.eyeIcon}
              onPress={() => setPasswordVisible(!passwordVisible)}
            >
              <Text style={styles.eyeIconText}>
                {passwordVisible ? '🙈' : '👁️'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

          <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
            <TouchableOpacity
              style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              <Text style={styles.loginButtonText}>
                {isLoading ? 'Signing In...' : 'Sign In'}
              </Text>
            </TouchableOpacity>
          </Animated.View>

          <TouchableOpacity style={styles.forgotPassword}>
            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </TouchableWithoutFeedback>
  );
}

function CompaniesScreen({ route, navigation }: any) {
  const { user } = route.params;
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  console.log('🏢 CompaniesScreen loaded');
  console.log('👤 User from route:', user);

  useEffect(() => {
    console.log('🔄 useEffect triggered, calling fetchCompanies');
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    console.log('📡 Starting companies fetch...');
    try {
      const token = await AsyncStorage.getItem('authToken');
      console.log('🎫 Retrieved token from storage:', token ? 'Present' : 'Missing');

      if (token) {
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        console.log('✅ Authorization header set');
      }

      console.log('🌐 Making GET /companies request');
      console.log('📡 API Base URL:', apiClient.defaults.baseURL);

      const response = await apiClient.get('/companies');
      console.log('📦 Companies API response:', response);
      console.log('📦 Response status:', response.status);
      console.log('📦 Response data:', response.data);

      setCompanies(response.data.companies);
      console.log('✅ Companies state updated with:', response.data.companies);
      console.log('📊 Companies array length:', response.data.companies.length);
    } catch (error: any) {
      console.error('❌ Fetch companies error:', error);
      console.error('❌ Error details:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        config: error.config,
      });
      Alert.alert('Error', 'Failed to load companies');
    } finally {
      console.log('🏁 Setting loading to false');
      setIsLoading(false);
    }
  };

  const handleCompanyPress = (company: Company) => {
    console.log('🏢 Navigating to company:', company.name);
    navigation.navigate('CompanyTabs', { company, user });
  };

  const renderCompany = ({ item }: { item: Company }) => {
    console.log('🎨 Rendering company:', item);
    return (
      <TouchableOpacity
        style={styles.companyContainer}
        onPress={() => handleCompanyPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.companyContent}>
          <View style={styles.companyInfo}>
            <Text style={styles.companyName}>{item.name}</Text>
            <Text style={styles.companyRole}>{item.user_role}</Text>
          </View>
          <View style={styles.arrowContainer}>
            <Text style={styles.arrow}>→</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading companies...</Text>
      </View>
    );
  }

  return (
    <View style={styles.companiesContainer}>
      <Text style={styles.companiesTitle}>Select Company</Text>
      <FlatList
        data={companies}
        renderItem={renderCompany}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.companiesList}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// Tab screens
function OverviewTab({ route }: any) {
  const { company, user } = route.params || {};

  return (
    <View style={styles.overviewContainer}>
      <View style={styles.headerContainer}>
        <View style={styles.headerContent}>
          <View style={styles.headerText}>
            <Text style={styles.headerCompany}>{company?.name || 'Company'}</Text>
            <Text style={styles.headerUser}>{user?.firstName} {user?.lastName}</Text>
          </View>
          <View style={styles.headerIcon}>
            <Text style={styles.iconText}>🏢</Text>
          </View>
        </View>
      </View>
      <View style={styles.contentPlaceholder}>
        <Text style={styles.placeholderText}>Overview coming soon...</Text>
      </View>
    </View>
  );
}

function CalendarTab({ route }: any) {
  const { company, user } = route.params || {};
  const navigation = useNavigation<any>();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showMonthSelector, setShowMonthSelector] = useState(false);
  const [monthJobs, setMonthJobs] = useState<{ [key: string]: number }>({});
  const [monthJobsWithStatus, setMonthJobsWithStatus] = useState<{ [key: string]: Array<{ status: string }> }>({});
  
  // Month banner images mapping (months are 0-indexed in JavaScript)
  const monthBanners: { [key: number]: any } = {
    0: require('./assets/images/jan.jpg'),   // January
    1: require('./assets/images/feb.jpg'),   // February
    2: require('./assets/images/mar.jpg'),   // March
    3: require('./assets/images/apr.jpg'),   // April
    4: require('./assets/images/maj.jpg'),   // May
    5: require('./assets/images/jun.jpg'),   // June
    6: require('./assets/images/jul.jpg'),   // July
    7: require('./assets/images/aug.jpg'),   // August
    8: require('./assets/images/sep.jpg'),   // September
    9: require('./assets/images/okt.jpg'),   // October
    10: require('./assets/images/nov.jpg'),  // November
    11: require('./assets/images/dec.jpg'),  // December
  };
  
  // Animation values for slide transition
  const slideAnim = useRef(new Animated.Value(0)).current;
  const screenWidth = Dimensions.get('window').width;
  const isAnimating = useRef(false);
  const currentDateRef = useRef(currentDate);
  
  // Keep ref in sync with state
  useEffect(() => {
    currentDateRef.current = currentDate;
  }, [currentDate]);
  
  // Swipe gesture handler for month navigation
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to horizontal swipes when not animating
        if (isAnimating.current) return false;
        return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 10;
      },
      onPanResponderGrant: () => {
        slideAnim.setOffset((slideAnim as any)._value || 0);
        slideAnim.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        // Constrain movement to screen width
        const maxDrag = screenWidth * 0.8;
        const constrainedDx = Math.max(-maxDrag, Math.min(maxDrag, gestureState.dx));
        slideAnim.setValue(constrainedDx);
      },
      onPanResponderRelease: (_, gestureState) => {
        slideAnim.flattenOffset();
        const swipeThreshold = 50; // Minimum swipe distance
        const velocityThreshold = 0.3; // Minimum swipe velocity
        const shouldSwipe = Math.abs(gestureState.dx) > swipeThreshold || Math.abs(gestureState.vx) > velocityThreshold;
        
        if (shouldSwipe && !isAnimating.current) {
          isAnimating.current = true;
          
          // Determine direction based on dx (displacement) primarily, velocity as secondary
          const isSwipeRight = gestureState.dx > 0;
          const isSwipeLeft = gestureState.dx < 0;
          
          if (isSwipeRight) {
            // Swipe right - go to previous month
            const dateToUse = currentDateRef.current; // Use ref to get current value
            Animated.timing(slideAnim, {
              toValue: screenWidth,
              duration: 300,
              useNativeDriver: true,
            }).start(() => {
              const newDate = new Date(dateToUse.getFullYear(), dateToUse.getMonth() - 1, 1);
              console.log('📅 Swiping right: from', dateToUse.getMonth() + 1, 'to', newDate.getMonth() + 1);
              setCurrentDate(newDate);
              // Wait for React to finish updating before sliding in
              InteractionManager.runAfterInteractions(() => {
                slideAnim.setValue(-screenWidth);
                Animated.timing(slideAnim, {
                  toValue: 0,
                  duration: 300,
                  useNativeDriver: true,
                }).start(() => {
                  isAnimating.current = false;
                });
              });
            });
          } else if (isSwipeLeft) {
            // Swipe left - go to next month
            const dateToUse = currentDateRef.current; // Use ref to get current value
            Animated.timing(slideAnim, {
              toValue: -screenWidth,
              duration: 300,
              useNativeDriver: true,
            }).start(() => {
              const newDate = new Date(dateToUse.getFullYear(), dateToUse.getMonth() + 1, 1);
              console.log('📅 Swiping left: from', dateToUse.getMonth() + 1, 'to', newDate.getMonth() + 1);
              setCurrentDate(newDate);
              // Wait for React to finish updating before sliding in
              InteractionManager.runAfterInteractions(() => {
                slideAnim.setValue(screenWidth);
                Animated.timing(slideAnim, {
                  toValue: 0,
                  duration: 300,
                  useNativeDriver: true,
                }).start(() => {
                  isAnimating.current = false;
                });
              });
            });
          } else {
            // No clear direction - snap back
            isAnimating.current = false;
            Animated.spring(slideAnim, {
              toValue: 0,
              useNativeDriver: true,
              tension: 50,
              friction: 7,
            }).start();
          }
        } else {
          // Snap back to center
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
            tension: 50,
            friction: 7,
          }).start(() => {
            isAnimating.current = false;
          });
        }
      },
    })
  ).current;
  
  const weekDays = ['Mon', 'Thu', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
  ];
  
  const getWorkDaysInMonth = (year: number, month: number) => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let workDays = 0;
    
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dayOfWeek = date.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        workDays++;
      }
    }
    return workDays;
  };
  
  const today = new Date();
  const currentMonthIndex = today.getMonth();
  const currentYear = today.getFullYear();
  
  const selectMonth = (monthIndex: number) => {
    const newDate = new Date(currentDate.getFullYear(), monthIndex, 1);
    setCurrentDate(newDate);
    setShowMonthSelector(false);
  };
  
  const changeYear = (direction: number) => {
    const newDate = new Date(currentDate.getFullYear() + direction, currentDate.getMonth(), 1);
    setCurrentDate(newDate);
  };

  useEffect(() => {
    if (user && user.id) {
      fetchMonthJobs();
    } else {
      console.log('⏳ Waiting for user data...', { user });
    }
  }, [currentDate, user?.id]);

  const fetchMonthJobs = async () => {
    console.log('📅 Starting to fetch month jobs...');
    console.log('👤 User:', user);
    
    if (!user) {
      console.log('❌ No user found, skipping job fetch');
      return;
    }
    
    try {
      const token = await AsyncStorage.getItem('authToken');
      console.log('🎫 Token retrieved:', token ? 'Present' : 'Missing');
      
      if (token) {
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }

      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      
      // Format dates as YYYY-MM-DD without timezone conversion issues
      const formatDateString = (date: Date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      };
      
      const startDate = formatDateString(firstDay);
      const endDate = formatDateString(lastDay);

      console.log('📅 Fetching jobs for:', { year, month: month + 1, startDate, endDate });
      console.log('🌐 API URL:', `${apiClient.defaults.baseURL}/jobs?start_date=${startDate}&end_date=${endDate}`);

      const response = await apiClient.get(`/jobs?start_date=${startDate}&end_date=${endDate}`);
      console.log('📦 API Response:', response);
      console.log('📦 Response status:', response.status);
      console.log('📦 Response data:', response.data);
      
      const allJobs = response.data.jobs || [];
      console.log('📋 Total jobs received:', allJobs.length);
      console.log('📋 Jobs data:', allJobs);
      
      // Filter jobs for logged-in user and track by date with status
      const jobsByDate: { [key: string]: number } = {};
      const jobsByDateWithStatus: { [key: string]: Array<{ status: string }> } = {};
      allJobs.forEach((job: Job) => {
        console.log('🔍 Checking job:', {
          id: job.id,
          assigned_user_id: job.assigned_user_id,
          user_id: user.id,
          scheduled_date: job.scheduled_date,
          status: job.status,
          scheduled_date_type: typeof job.scheduled_date,
          matches: job.assigned_user_id === user.id
        });
        
        // Check if job belongs to user (handle both number and string ID comparison)
        const jobUserId = job.assigned_user_id;
        const currentUserId = user.id;
        const userIdsMatch = jobUserId === currentUserId || 
                            String(jobUserId) === String(currentUserId) ||
                            Number(jobUserId) === Number(currentUserId);
        
        if (userIdsMatch && job.scheduled_date) {
          // Extract date string - just take the YYYY-MM-DD part without timezone conversion
          let dateKey: string;
          if (typeof job.scheduled_date === 'string') {
            // If string, just take the date part (YYYY-MM-DD) - don't parse as Date to avoid timezone shift
            dateKey = job.scheduled_date.split('T')[0].split(' ')[0];
            // Ensure it's in YYYY-MM-DD format
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
              console.log('⚠️ Invalid date format:', job.scheduled_date, '→', dateKey);
              return;
            }
            
            jobsByDate[dateKey] = (jobsByDate[dateKey] || 0) + 1;
            if (!jobsByDateWithStatus[dateKey]) {
              jobsByDateWithStatus[dateKey] = [];
            }
            jobsByDateWithStatus[dateKey].push({ status: job.status || 'scheduled' });
            console.log('✅ Added job to date:', dateKey, 'Status:', job.status, 'Original date:', job.scheduled_date, 'Total for date:', jobsByDate[dateKey]);
          }
        } else {
          console.log('❌ Job not matched:', {
            userIdsMatch,
            hasScheduledDate: !!job.scheduled_date
          });
        }
      });
      
      console.log('📊 Jobs by date:', jobsByDate);
      console.log('📊 Jobs by date with status:', jobsByDateWithStatus);
      setMonthJobs(jobsByDate);
      setMonthJobsWithStatus(jobsByDateWithStatus);
      console.log('✅ Month jobs state updated');
      console.log('📊 Final jobs by date object:', jobsByDate);
      console.log('📊 Number of days with jobs:', Object.keys(jobsByDate).length);
    } catch (error: any) {
      console.error('❌ Error fetching month jobs:', error);
      console.error('❌ Error details:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        config: error.config,
        url: error.config?.url,
        baseURL: error.config?.baseURL,
      });
      
      // Show user-friendly error
      if (error.response) {
        console.error(`❌ API Error: ${error.response.status} - ${error.response.statusText}`);
        console.error(`❌ Error data:`, error.response.data);
      } else if (error.request) {
        console.error('❌ Network Error: No response received');
        console.error('❌ Request was made but no response. Is the API server running?');
      } else {
        console.error('❌ Request setup error:', error.message);
      }
      
      setMonthJobs({});
    }
  };
  
  const getMonthName = (date: Date) => {
    return date.toLocaleString('en-US', { month: 'long' });
  };
  
  const getYear = (date: Date) => {
    return date.getFullYear();
  };
  
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    
    // Get day of week for first day (0 = Sunday, we want Monday = 0)
    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6; // Sunday becomes 6
    
    const days: (number | null)[] = [];
    
    // Add empty cells for days before the first of the month
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null);
    }
    
    // Add all days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    
    // Add empty cells to complete the last week
    while (days.length % 7 !== 0) {
      days.push(null);
    }
    
    return days;
  };
  
  const days = getDaysInMonth(currentDate);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  
  const todayDate = new Date();
  const isCurrentMonth = todayDate.getMonth() === currentDate.getMonth() && todayDate.getFullYear() === currentDate.getFullYear();
  const currentDay = todayDate.getDate();

  if (showMonthSelector) {
    return (
      <View style={styles.calendarContainer}>
        <View style={styles.calendarTopSpace} />
        
        {/* Year selector */}
        <View style={styles.yearSelectorRow}>
          <TouchableOpacity onPress={() => changeYear(-1)} style={styles.yearArrow}>
            <Text style={styles.yearArrowText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.yearSelectorText}>{currentDate.getFullYear()}</Text>
          <TouchableOpacity onPress={() => changeYear(1)} style={styles.yearArrow}>
            <Text style={styles.yearArrowText}>›</Text>
          </TouchableOpacity>
        </View>
        
        {/* Month list */}
        <FlatList
          data={months}
          keyExtractor={(item, index) => index.toString()}
          contentContainerStyle={styles.monthListContainer}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => {
            const isCurrentMonth = index === currentMonthIndex && currentDate.getFullYear() === currentYear;
            const workDays = getWorkDaysInMonth(currentDate.getFullYear(), index);
            
            return (
              <TouchableOpacity
                style={[
                  styles.monthCard,
                  isCurrentMonth && styles.monthCardActive
                ]}
                onPress={() => selectMonth(index)}
                activeOpacity={0.8}
              >
                <View style={styles.workDaysContainer}>
                  <Text style={[
                    styles.workDaysLabel,
                    isCurrentMonth && styles.workDaysLabelActive
                  ]}>
                    Work days
                  </Text>
                  <Text style={[
                    styles.workDaysNumber,
                    isCurrentMonth && styles.workDaysNumberActive
                  ]}>
                    {workDays}
                  </Text>
                </View>
                <Text style={[
                  styles.monthCardText,
                  isCurrentMonth && styles.monthCardTextActive
                ]}>
                  {item}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.calendarContainer} {...panResponder.panHandlers}>
      {/* Header space for future content */}
      <View style={styles.calendarTopSpace} />
      
      {/* Month/Year Banner with Image - Clickable */}
      <TouchableOpacity 
        style={styles.calendarBanner}
        onPress={() => setShowMonthSelector(true)}
        activeOpacity={0.8}
      >
        <Image 
          source={monthBanners[currentDate.getMonth()]} 
          style={styles.calendarBannerImage}
          resizeMode="cover"
        />
        <View style={styles.calendarBannerOverlay}>
          <Text style={styles.calendarYear}>{getYear(currentDate)}</Text>
          <Text style={styles.calendarMonth}>{getMonthName(currentDate)}</Text>
        </View>
      </TouchableOpacity>
      
      {/* Week day headers */}
      <View style={styles.weekDaysRow}>
        {weekDays.map((day, index) => (
          <View key={index} style={styles.weekDayCell}>
            <Text style={styles.weekDayText}>{day}</Text>
          </View>
        ))}
      </View>
      
      {/* Calendar grid with slide animation */}
      <Animated.View 
        style={[
          styles.calendarGrid,
          {
            transform: [{ translateX: slideAnim }],
          }
        ]}
      >
        {weeks.map((week, weekIndex) => (
          <View key={weekIndex} style={styles.calendarWeekRow}>
            {week.map((day, dayIndex) => {
              if (day === null) {
                return <View key={dayIndex} style={styles.calendarDayCell} />;
              }
              
              // Create date string without timezone conversion (use local date components)
              const year = currentDate.getFullYear();
              const month = currentDate.getMonth();
              const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              
              const jobCount = monthJobs[dateString] || 0;
              const jobsForDate = monthJobsWithStatus[dateString] || [];
              
              // Group dots into rows of 5
              const dotsPerRow = 5;
              const dotRows: Array<Array<{ status: string }>> = [];
              for (let i = 0; i < jobsForDate.length; i += dotsPerRow) {
                dotRows.push(jobsForDate.slice(i, i + dotsPerRow));
              }

              return (
                <TouchableOpacity
                  key={dayIndex}
                  style={styles.calendarDayCell}
                  onPress={() => {
                    if (navigation && company && user) {
                      navigation.navigate('DayView', { date: dateString, company, user });
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.calendarDayContent}>
                    <Text style={[
                      styles.calendarDayText,
                      isCurrentMonth && day === currentDay && styles.calendarDayTextCurrent
                    ]}>
                      {day}
                    </Text>
                    
                    {/* Job dots */}
                    {jobCount > 0 && (
                      <View style={styles.jobDotsContainer}>
                        {dotRows.map((row, rowIndex) => (
                          <View key={rowIndex} style={styles.jobDotsRow}>
                            {row.map((job, dotIndex) => {
                              const isCompleted = job.status === 'completed';
                              const isCancelled = job.status === 'cancelled';
                              return (
                                <View 
                                  key={dotIndex} 
                                  style={[
                                    styles.jobDot,
                                    isCompleted && styles.jobDotCompleted,
                                    isCancelled && styles.jobDotCancelled,
                                  ]} 
                                />
                              );
                            })}
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                  
                  {/* Today indicator at bottom */}
                  {isCurrentMonth && day === currentDay && (
                    <View style={styles.currentDayIndicator} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </Animated.View>
      
      {/* This Month Button */}
      <TouchableOpacity
        style={styles.thisMonthButton}
        onPress={() => {
          const today = new Date();
          const newDate = new Date(today.getFullYear(), today.getMonth(), 1);
          setCurrentDate(newDate);
        }}
        activeOpacity={0.7}
      >
        <Text style={styles.thisMonthButtonText}>This month</Text>
      </TouchableOpacity>
    </View>
  );
}

function TodayTab({ route }: any) {
  const { company, user } = route.params || {};
  const insets = useSafeAreaInsets();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isPopupVisible, setIsPopupVisible] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const toastOpacity = useState(new Animated.Value(0))[0];
  
  // Month banner images mapping (months are 0-indexed in JavaScript)
  const monthBanners: { [key: number]: any } = {
    0: require('./assets/images/jan.jpg'),   // January
    1: require('./assets/images/feb.jpg'),   // February
    2: require('./assets/images/mar.jpg'),   // March
    3: require('./assets/images/apr.jpg'),   // April
    4: require('./assets/images/maj.jpg'),   // May
    5: require('./assets/images/jun.jpg'),   // June
    6: require('./assets/images/jul.jpg'),   // July
    7: require('./assets/images/aug.jpg'),   // August
    8: require('./assets/images/sep.jpg'),   // September
    9: require('./assets/images/okt.jpg'),   // October
    10: require('./assets/images/nov.jpg'),  // November
    11: require('./assets/images/dec.jpg'),  // December
  };
  
  const screenHeight = Dimensions.get('window').height;
  const today = new Date();
  const popupTranslateY = useRef(new Animated.Value(screenHeight)).current; // Start below screen

  useEffect(() => {
    fetchTodayJobs();
  }, []);

  const handleToggleJobCompletion = async (job: Job, e?: any) => {
    if (e) {
      e.stopPropagation(); // Prevent triggering job card press
    }
    
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }
      
      const newStatus = job.status === 'completed' ? 'scheduled' : 'completed';
      
      await apiClient.put(`/jobs/${job.id}/status`, {
        status: newStatus,
      });
      
      // Update local state
      setJobs(prevJobs =>
        prevJobs.map(j => j.id === job.id ? { ...j, status: newStatus } : j)
      );
      
      // If this is the selected job, update it too
      if (selectedJob && selectedJob.id === job.id) {
        setSelectedJob({ ...selectedJob, status: newStatus });
      }
    } catch (error: any) {
      console.error('Error toggling job completion:', error);
      Alert.alert('Error', 'Failed to update job status. Please try again.');
    }
  };

  // Handle popup visibility - slide up when visible
  useEffect(() => {
    console.log('🟢 useEffect triggered, isPopupVisible:', isPopupVisible);
    if (isPopupVisible) {
      // Slide up to 65% visible (top at 35% of screen)
      const targetY = screenHeight * 0.35;
      console.log('🟢 Animating to:', targetY, 'screenHeight:', screenHeight);
      Animated.spring(popupTranslateY, {
        toValue: targetY,
        useNativeDriver: true,
        tension: 60,
        friction: 12,
      }).start(() => {
        console.log('🟢 Animation completed');
      });
    } else {
      // Slide down below screen
      console.log('🟢 Animating down');
      Animated.timing(popupTranslateY, {
        toValue: screenHeight,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isPopupVisible]);

  const todayString = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;

  const handleJobPress = (job: Job) => {
    console.log('🔵 Job pressed:', job.id);
    setSelectedJob(job);
    setIsPopupVisible(true);
    console.log('🔵 isPopupVisible set to true');
  };

  const fetchTodayJobs = async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }

      // Get today's date in YYYY-MM-DD format
      const today = new Date();
      const todayString = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;

      const response = await apiClient.get(`/jobs?start_date=${todayString}&end_date=${todayString}`);
      const allJobs = response.data.jobs || [];
      
      // Filter jobs for the logged-in user only
      const userJobs = allJobs.filter((job: Job) => job.assigned_user_id === user.id);
      
      setJobs(userJobs);
    } catch (error: any) {
      console.error('Error fetching today jobs:', error);
      Alert.alert('Error', 'Failed to load today\'s jobs');
    } finally {
      setIsLoading(false);
    }
  };


  const handleCopy = (text: string) => {
    setToastVisible(true);
    Animated.sequence([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.delay(1000),
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setToastVisible(false);
    });
  };

  const formatTime = (timeFrom?: string, timeTo?: string) => {
    if (!timeFrom || !timeTo) return null;
    return `${timeFrom} - ${timeTo}`;
  };

  const formatDuration = (minutes?: number) => {
    if (!minutes) return null;
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins} min` : `${hours}h`;
  };

  if (isLoading) {
    return (
      <View style={styles.dayViewContainer}>
        <View style={styles.dayViewLoading}>
          <Text style={styles.loadingText}>Loading today's jobs...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.dayViewContainer}>
      {/* Header */}
      <View style={styles.dayViewHeader}>
        <Image 
          source={monthBanners[today.getMonth()]} 
          style={styles.dayViewHeaderImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['rgba(61, 213, 122, 0.6)', 'rgba(61, 213, 122, 1)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.dayViewHeaderOverlay}
          pointerEvents="box-none"
        >
          <View style={styles.dayViewHeaderContent}>
            <View style={styles.dayViewHeaderLeft}>
              <Text style={styles.dayViewDayName}>Today</Text>
              <Text style={styles.dayViewDate}>{today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* Jobs List */}
      <View style={styles.dayViewJobsWrapper}>
        <FlatList
          data={jobs}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.dayViewJobsList}
          renderItem={({ item }) => {
            const clientName = `${item.name || ''} ${item.last_name || ''}`.trim();
            const address = item.address ? `${item.address}${item.zip_code && item.city ? ' • ' : ''}${item.zip_code || ''} ${item.city || ''}`.trim() : '';
            const timeRange = formatTime(item.scheduled_time_from, item.scheduled_time_to);
            const duration = formatDuration(item.total_duration);
            const isCompleted = item.status === 'completed';
            const isCancelled = item.status === 'cancelled';
            const taskCount = item.service_count || 0;

            return (
              <TouchableOpacity 
                style={[
                  styles.jobCard, 
                  isCompleted && styles.jobCardCompleted,
                  isCancelled && styles.jobCardCancelled,
                ]}
                activeOpacity={0.7}
                onPress={() => handleJobPress(item)}
              >
                <View style={styles.jobCardBadge}>
                  <Text style={styles.jobCardBadgeText}>{taskCount}</Text>
                </View>
                
                <Text style={styles.jobCardClientName}>{clientName || 'Unknown Client'}</Text>
                
                {address && (
                  <Text style={styles.jobCardAddress}>{address}</Text>
                )}
                
                {timeRange && (
                  <View style={styles.jobCardTimeRow}>
                    <Text style={styles.jobCardTimeIcon}>🕐</Text>
                    <Text style={styles.jobCardTime}>{timeRange}</Text>
                  </View>
                )}
                
                <View style={styles.jobCardSeparator} />
                
                <View style={styles.jobCardBar}>
                  <View style={styles.jobCardBarLeft}>
                    <Text style={styles.jobCardBarIcon}>📋</Text>
                    <Text style={styles.jobCardBarText}>{taskCount} tasks</Text>
                  </View>
                  {duration && (
                    <View style={styles.jobCardBarRight}>
                      <Text style={styles.jobCardBarIcon}>⏱️</Text>
                      <Text style={styles.jobCardBarText}>{duration}</Text>
                    </View>
                  )}
                  <TouchableOpacity 
                    style={styles.jobCardCheckbox}
                    onPress={(e) => handleToggleJobCompletion(item, e)}
                    activeOpacity={0.7}
                  >
                    {isCompleted ? (
                      <View style={styles.jobCardCheckboxChecked}>
                        <Text style={styles.jobCardCheckmark}>✓</Text>
                      </View>
                    ) : isCancelled ? (
                      <View style={styles.jobCardCheckboxCancelled}>
                        <Text style={styles.jobCardCheckmarkCancelled}>✕</Text>
                      </View>
                    ) : (
                      <View style={styles.jobCardCheckboxUnchecked}>
                        <Text style={styles.jobCardCheckmarkUnchecked}>✓</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.dayViewEmpty}>
              <Text style={styles.dayViewEmptyText}>No jobs scheduled for today</Text>
            </View>
          }
        />
      </View>

      {/* Overlay */}
      {isPopupVisible && (
        <TouchableWithoutFeedback onPress={() => setIsPopupVisible(false)}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>
      )}

      {/* Popup Container */}
      {isPopupVisible && selectedJob && (
        <Animated.View
          style={[
            styles.popupContainer,
            {
              transform: [{ translateY: popupTranslateY }],
              height: screenHeight * 0.65, // 65% of screen height
            }
          ]}
        >
          <ScrollView
            style={styles.sheetContent}
            contentContainerStyle={styles.sheetContentContainer}
            showsVerticalScrollIndicator={true}
          >
            <JobDetailSlideout
              job={selectedJob}
              date={todayString}
              onClose={() => {
                setIsPopupVisible(false);
                setTimeout(() => setSelectedJob(null), 300); // Clear after animation
              }}
              onCopy={handleCopy}
              onJobUpdate={(updatedJob) => {
                setSelectedJob(updatedJob);
                // Update the job in the jobs list immediately
                setJobs(prevJobs =>
                  prevJobs.map(j => j.id === updatedJob.id ? updatedJob : j)
                );
              }}
            />
          </ScrollView>
        </Animated.View>
      )}

      {/* Toast Notification */}
      {toastVisible && (
        <Animated.View style={[styles.toastContainer, { opacity: toastOpacity }]}>
          <Text style={styles.toastText}>Copied to clipboard</Text>
        </Animated.View>
      )}
    </View>
  );
}

function JobDetailSlideout({ job, date, onClose, onCopy, isExpanded, onJobUpdate, scrollViewRef, scrollOffsetYRef }: { job: Job & { timeline?: Array<{ id?: number; description?: string; message?: string; created_at: string; user_id?: number; action?: string }> }; date: string; onClose: () => void; onCopy: (text: string) => void; isExpanded?: boolean; onJobUpdate?: (updatedJob: Job) => void; scrollViewRef?: React.RefObject<ScrollView | null>; scrollOffsetYRef?: React.MutableRefObject<number> }) {
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const noteInputRef = useRef<TextInput>(null);
  const noteInputContainerRef = useRef<View>(null);
  const isCompleted = job.status === 'completed';
  
  // Scroll input into view when keyboard appears
  useEffect(() => {
    if (!showNoteInput) return;
    
    const keyboardDidShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        // Simply scroll to end when keyboard shows - the input is at the bottom
        setTimeout(() => {
          scrollViewRef?.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    );
    
    // Also scroll when input appears
    const timeout = setTimeout(() => {
      if (scrollViewRef?.current) {
        scrollViewRef.current.scrollToEnd({ animated: true });
      }
    }, 200);
    
    return () => {
      keyboardDidShowListener.remove();
      clearTimeout(timeout);
    };
  }, [showNoteInput, scrollViewRef]);
  
  const clientName = `${job.name || ''} ${job.last_name || ''}`.trim();
  const clientType = job.is_company ? 'Company' : 'Person';
  const address = job.address ? `${job.address}${job.zip_code && job.city ? ' • ' : ''}${job.zip_code || ''} ${job.city || ''}`.trim() : '';
  
  const formatFullDate = (dateString: string) => {
    const date = new Date(dateString);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dayName = dayNames[date.getDay()];
    const month = monthNames[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    return `${dayName}, ${month} ${day}, ${year}`;
  };

  const formatTime = (timeFrom?: string, timeTo?: string) => {
    if (!timeFrom || !timeTo) return 'Not set';
    return `${timeFrom} - ${timeTo}`;
  };

  const formatDuration = (minutes?: number) => {
    if (!minutes) return '0 min';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins} min` : `${hours}h`;
  };

  const formatPrice = (price?: number | string) => {
    if (!price) return '$0';
    const numPrice = typeof price === 'string' ? parseFloat(price) : price;
    if (isNaN(numPrice)) return '$0';
    return `$${numPrice.toFixed(0)}`;
  };

  const handleCopy = async (text: string) => {
    if (!text) return;
    await Clipboard.setStringAsync(text);
    onCopy(text);
  };

  const services = job.services || [];
  const completedCount = job.completed_tasks || 0;
  const totalTasks = job.total_tasks || services.length;
  const totalDuration = job.total_duration || 0;
  const totalPrice = job.total_price || 0;
  
  const formattedTime = formatTime(job.scheduled_time_from, job.scheduled_time_to);
  const formattedDate = formatFullDate(date);

  const handleToggleComplete = async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }
      
      const newStatus = isCompleted ? 'scheduled' : 'completed';
      
      await apiClient.put(`/jobs/${job.id}/status`, {
        status: newStatus,
      });
      
      // Update job via callback
      if (onJobUpdate) {
        onJobUpdate({ ...job, status: newStatus });
      }
    } catch (error: any) {
      console.error('Error toggling job completion:', error);
      Alert.alert('Error', 'Failed to update job status. Please try again.');
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancel Job',
      'Are you sure you want to cancel this job?',
      [
        { text: 'No', style: 'cancel' },
        { 
          text: 'Yes', 
          style: 'destructive',
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('authToken');
              if (token) {
                apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
              }
              
              await apiClient.put(`/jobs/${job.id}/status`, {
                status: 'cancelled',
              });
              
              if (onJobUpdate) {
                onJobUpdate({ ...job, status: 'cancelled' });
              }
              
              setShowOptionsMenu(false);
            } catch (error: any) {
              console.error('Error cancelling job:', error);
              Alert.alert('Error', 'Failed to cancel job. Please try again.');
            }
          }
        },
      ]
    );
  };

  return (
    <View style={styles.jobDetailContainer}>
      {/* Dark green header */}
      <View 
        style={[
          styles.jobDetailHeader,
          isExpanded && styles.jobDetailHeaderExpanded
        ]}
      >
        {/* Handle bar at top of green header */}
        <View style={styles.sheetHandleInHeader}>
          <View style={styles.sheetHandleBarInHeader} />
        </View>
        
        {/* Action buttons row - positioned to the right, left of exit button */}
        <View style={styles.jobDetailHeaderActions}>
          {/* Options icon */}
          <TouchableOpacity 
            style={styles.jobDetailActionButton}
            onPress={() => setShowOptionsMenu(!showOptionsMenu)}
            activeOpacity={0.7}
          >
            <View style={styles.optionsIcon}>
              <View style={styles.optionsDot} />
              <View style={styles.optionsDot} />
              <View style={styles.optionsDot} />
            </View>
          </TouchableOpacity>
          
          {/* Complete icon */}
          <TouchableOpacity 
            style={styles.jobDetailActionButton}
            onPress={handleToggleComplete}
            activeOpacity={0.7}
          >
            <View style={[styles.completeIcon, isCompleted && styles.completeIconActive]}>
              <Text style={[styles.completeCheckmark, isCompleted && styles.completeCheckmarkActive]}>✓</Text>
            </View>
          </TouchableOpacity>
          
          {/* Close button */}
          <TouchableOpacity 
            style={styles.jobDetailCloseButton}
            onPress={onClose}
          >
            <Text style={styles.jobDetailCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
        
        {/* Options menu */}
        {showOptionsMenu && (
          <>
            <TouchableWithoutFeedback onPress={() => setShowOptionsMenu(false)}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>
            <View style={styles.optionsMenu}>
              <TouchableOpacity 
                style={styles.optionsMenuItem}
                onPress={handleCancel}
                activeOpacity={0.7}
              >
                <Text style={styles.optionsMenuText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
        <View style={styles.jobDetailClientType}>
          <Text style={styles.jobDetailClientTypeText}>{clientType}</Text>
        </View>
        <TouchableOpacity onPress={() => handleCopy(clientName)} activeOpacity={0.7}>
          <Text style={styles.jobDetailClientName}>{clientName || 'Unknown Client'}</Text>
        </TouchableOpacity>
        <View style={styles.jobDetailSeparator} />
        {job.client_email && (
          <TouchableOpacity onPress={() => handleCopy(job.client_email!)} activeOpacity={0.7}>
            <View style={styles.jobDetailContactRow}>
              <View style={styles.jobDetailIconWrapper}>
                <MailIcon />
              </View>
              <Text style={styles.jobDetailContactText}>{job.client_email}</Text>
            </View>
          </TouchableOpacity>
        )}
        {job.client_phone && (
          <TouchableOpacity onPress={() => handleCopy(job.client_phone!)} activeOpacity={0.7}>
            <View style={styles.jobDetailContactRow}>
              <View style={styles.jobDetailIconWrapper}>
                <PhoneIcon />
              </View>
              <Text style={styles.jobDetailContactText}>{job.client_phone}</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* White sections */}
      <View style={styles.jobDetailContent}>
        {/* Schedule & Location */}
        <View style={styles.jobDetailSection}>
          <Text style={styles.jobDetailSectionTitle}>Schedule & Location</Text>
          {address && (
            <TouchableOpacity onPress={() => handleCopy(address)} activeOpacity={0.7}>
              <View style={styles.jobDetailInfoRow}>
                <View style={styles.jobDetailIconWrapper}>
                  <LocationIcon />
                </View>
                <Text style={styles.jobDetailInfoText}>{address}</Text>
              </View>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => handleCopy(formattedTime)} activeOpacity={0.7}>
            <View style={styles.jobDetailInfoRow}>
              <View style={styles.jobDetailIconWrapper}>
                <TimeIcon />
              </View>
              <Text style={styles.jobDetailInfoText}>{formattedTime}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleCopy(formattedDate)} activeOpacity={0.7}>
            <View style={styles.jobDetailInfoRow}>
              <View style={styles.jobDetailIconWrapper}>
                <DateIcon />
              </View>
              <Text style={styles.jobDetailInfoText}>{formattedDate}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Tasks */}
        <View style={styles.jobDetailTasksSection}>
          <View style={styles.jobDetailTasksHeader}>
            <Text style={styles.jobDetailSectionTitle}>Tasks</Text>
            <Text style={styles.jobDetailTasksCount}>{completedCount} of {totalTasks} complete</Text>
          </View>

          {services.length > 0 ? (
            services.map((item) => (
              <View key={item.id} style={styles.jobDetailTaskItemContainer}>
                <View style={styles.jobDetailTaskItem}>
                  <View style={styles.jobDetailTaskCheckbox}>
                    <View style={item.is_completed ? styles.jobDetailTaskCheckboxChecked : styles.jobDetailTaskCheckboxUnchecked}>
                      <Text style={item.is_completed ? styles.jobDetailTaskCheckmark : styles.jobDetailTaskCheckmarkUnchecked}>✓</Text>
                    </View>
                  </View>
                  <View style={styles.jobDetailTaskContent}>
                    <Text style={styles.jobDetailTaskName}>{item.service_name || 'Task'}</Text>
                    <View style={styles.jobDetailTaskMeta}>
                      <Text style={styles.jobDetailTaskMetaText}>{formatDuration(item.duration_minutes)}</Text>
                      <Text style={styles.jobDetailTaskMetaText}> • </Text>
                      <Text style={styles.jobDetailTaskMetaText}>{formatPrice(item.price)}</Text>
                    </View>
                  </View>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.jobDetailNoTasks}>No tasks assigned</Text>
          )}

          {/* Total bar */}
          <View style={styles.jobDetailTotalBar}>
            <View style={styles.jobDetailTotalLeft}>
              <Text style={styles.jobDetailTotalLabel}>Total</Text>
              <View style={styles.jobDetailTotalTimeRow}>
                <View style={styles.jobDetailIconWrapper}>
                  <TimerIcon />
                </View>
                <Text style={styles.jobDetailTotalTime}>{formatDuration(totalDuration)} estimated</Text>
              </View>
            </View>
            <Text style={styles.jobDetailTotalPrice}>{formatPrice(totalPrice)}</Text>
          </View>
        </View>

        {/* Timeline Section */}
        <View style={styles.jobDetailTimelineSection}>
          <Text style={styles.jobDetailSectionTitle}>Timeline</Text>
          {job.timeline && job.timeline.length > 0 ? (
            <View style={styles.timelineContainer}>
              {job.timeline.map((item: any, index: number) => (
                <View key={item.id || index} style={styles.timelineItem}>
                  <View style={styles.timelineLeft}>
                    {index < (job.timeline?.length || 0) - 1 && <View style={styles.timelineLine} />}
                    <View style={styles.timelineDot} />
                  </View>
                  <View style={styles.timelineContent}>
                    <Text style={styles.timelineText}>{item.description || item.message || 'Update'}</Text>
                    {item.created_at && (
                      <Text style={styles.timelineDate}>
                        {new Date(item.created_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.jobDetailNoTasks}>No timeline entries yet</Text>
          )}
          
          {/* Add Note Button */}
          {!showNoteInput && (
            <TouchableOpacity 
              style={styles.addNoteButton}
              onPress={() => setShowNoteInput(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.addNoteButtonText}>add note +</Text>
            </TouchableOpacity>
          )}
          
          {/* Note Input */}
          {showNoteInput && (
            <View ref={noteInputContainerRef} style={styles.noteInputContainer}>
              <TextInput
                ref={noteInputRef}
                style={styles.noteInput}
                placeholder="Write your note here..."
                placeholderTextColor="#999"
                multiline
                value={noteText}
                onChangeText={setNoteText}
                autoFocus
                onFocus={() => {
                  // Scroll to end when input gets focus
                  setTimeout(() => {
                    scrollViewRef?.current?.scrollToEnd({ animated: true });
                  }, 300);
                }}
              />
              <View style={styles.noteInputActions}>
                <TouchableOpacity
                  style={styles.noteIconButton}
                  onPress={() => {
                    setShowNoteInput(false);
                    setNoteText('');
                  }}
                >
                  <Text style={styles.noteCancelIcon}>✕</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.noteIconButton, styles.noteSaveIconButton, isSavingNote && styles.noteSaveButtonDisabled]}
                  onPress={async () => {
                    if (!noteText.trim() || isSavingNote) return;
                    
                    setIsSavingNote(true);
                    try {
                      const token = await AsyncStorage.getItem('authToken');
                      if (token) {
                        apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
                      }
                      
                      // Add note to timeline via API
                      const response = await apiClient.post(`/jobs/${job.id}/notes`, {
                        content: noteText.trim(),
                      });
                      
                      // Refresh job data
                      const jobResponse = await apiClient.get(`/jobs/${job.id}`);
                      const updatedJob = jobResponse.data.job;
                      
                      if (onJobUpdate) {
                        onJobUpdate(updatedJob);
                      }
                      
                      setShowNoteInput(false);
                      setNoteText('');
                    } catch (error: any) {
                      console.error('Error adding note:', error);
                      Alert.alert('Error', 'Failed to add note. Please try again.');
                    } finally {
                      setIsSavingNote(false);
                    }
                  }}
                  disabled={isSavingNote || !noteText.trim()}
                >
                  <Text style={styles.noteSaveIcon}>✓</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

function DayViewScreen({ route, navigation }: any) {
  const { date, company, user } = route.params;
  const insets = useSafeAreaInsets();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingJobDetails, setIsLoadingJobDetails] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isSlideoutVisible, setIsSlideoutVisible] = useState(false);
  const screenHeight = Dimensions.get('window').height;
  
  // Month banner images mapping (months are 0-indexed in JavaScript)
  const monthBanners: { [key: number]: any } = {
    0: require('./assets/images/jan.jpg'),   // January
    1: require('./assets/images/feb.jpg'),   // February
    2: require('./assets/images/mar.jpg'),   // March
    3: require('./assets/images/apr.jpg'),   // April
    4: require('./assets/images/maj.jpg'),   // May
    5: require('./assets/images/jun.jpg'),   // June
    6: require('./assets/images/jul.jpg'),   // July
    7: require('./assets/images/aug.jpg'),   // August
    8: require('./assets/images/sep.jpg'),   // September
    9: require('./assets/images/okt.jpg'),   // October
    10: require('./assets/images/nov.jpg'),  // November
    11: require('./assets/images/dec.jpg'),  // December
  };
  
  const COLLAPSED_POSITION = 35; // top: 35% (partially visible, base position for dragging)
  const BASE_POSITION_PIXELS = screenHeight * 0.35; // 35% of screen in pixels
  const INITIAL_OFFSET = screenHeight * 0.65; // Start hidden below (65% of screen below visible area)
  
  // Use translateY for everything - starts hidden, animates to 35% position, then allows dragging
  const slideoutTranslateY = useRef(new Animated.Value(INITIAL_OFFSET)).current; // Start hidden
  const keyboardOffsetY = useRef(new Animated.Value(0)).current; // Additional offset for keyboard
  const [isExpanded, setIsExpanded] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const toastOpacity = useState(new Animated.Value(0))[0];
  const lastTranslateY = useRef(INITIAL_OFFSET); // Current translateY value in pixels (starts hidden)
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetY = useRef(0);
  const innerContainerHeightRef = useRef<number>(0);
  
  // Handle keyboard show/hide to adjust slideout position
  useEffect(() => {
    const keyboardWillShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (event) => {
        const keyboardHeight = event.endCoordinates?.height || 0;
        Animated.timing(keyboardOffsetY, {
          toValue: -(keyboardHeight + 80), // Move up by keyboard height + extra 80px for save button
          duration: event.duration || 250,
          useNativeDriver: true,
        }).start();
      }
    );
    
    const keyboardWillHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      (event) => {
        Animated.timing(keyboardOffsetY, {
          toValue: 0,
          duration: event.duration || 250,
          useNativeDriver: true,
        }).start();
      }
    );
    
    return () => {
      keyboardWillShowListener.remove();
      keyboardWillHideListener.remove();
    };
  }, []);

  useEffect(() => {
    fetchDayJobs();
  }, [date]);

  useEffect(() => {
    if (isSlideoutVisible) {
      // Reset translateY to base position (35%) when opening
      lastTranslateY.current = 0;
      slideoutTranslateY.setValue(INITIAL_OFFSET); // Start hidden
      setIsExpanded(false);
      scrollOffsetY.current = 0;
      // Animate from hidden (INITIAL_OFFSET) to 35% position (0 translateY)
      Animated.spring(slideoutTranslateY, {
        toValue: 0, // 0 = at 35% position (base position)
        useNativeDriver: true,
        tension: 70,
        friction: 12,
      }).start(() => {
        lastTranslateY.current = 0; // Update to base position
        // Ensure scroll starts at top
        setTimeout(() => {
          scrollViewRef.current?.scrollTo({ y: 0, animated: false });
        }, 100);
      });
    } else {
      lastTranslateY.current = INITIAL_OFFSET;
      scrollOffsetY.current = 0;
      // Close animation: animate translateY back to hidden
      Animated.timing(slideoutTranslateY, {
        toValue: INITIAL_OFFSET,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isSlideoutVisible]);

  // PanResponder for bottom sheet gestures
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        if (Math.abs(gestureState.dy) <= Math.abs(gestureState.dx)) return false;
        if (!isExpanded) {
          return Math.abs(gestureState.dy) > 5;
        }
        return gestureState.dy > 5 || (gestureState.dy < -5 && scrollOffsetY.current <= 5);
      },
      onPanResponderGrant: () => {
        // Store current translateY position as offset
        slideoutTranslateY.setOffset(lastTranslateY.current);
        slideoutTranslateY.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        // Calculate new translateY from base position (35%)
        // lastTranslateY.current is the offset (starting position of this gesture)
        // gestureState.dy is negative when dragging UP, positive when dragging DOWN
        const newTranslateY = lastTranslateY.current + gestureState.dy;
        
        // Allow dragging up (negative translateY) enough to show bottom of tall content
        // Container is at top: BASE_POSITION_PIXELS (35%), with height: innerContainerHeightRef.current
        // To see bottom: container bottom = BASE_POSITION_PIXELS + translateY + innerContainerHeightRef.current >= screenHeight
        // So: translateY >= screenHeight - BASE_POSITION_PIXELS - innerContainerHeightRef.current
        const visibleHeight = screenHeight - BASE_POSITION_PIXELS; // 65% of screen
        const minTranslateY = innerContainerHeightRef.current > visibleHeight 
          ? -(innerContainerHeightRef.current - visibleHeight) 
          : -BASE_POSITION_PIXELS; // Max drag up: -35% of screen (to reach top: 0%)
        
        // Constrain: minTranslateY <= translateY <= 0
        const constrainedTranslateY = Math.max(minTranslateY, Math.min(0, newTranslateY));
        
        // Set value as delta from offset for smooth following
        // Apply constraint to ensure we can reach bottom of tall content
        const constrainedDelta = constrainedTranslateY - lastTranslateY.current;
        slideoutTranslateY.setValue(constrainedDelta);
      },
      onPanResponderRelease: (_, gestureState) => {
        slideoutTranslateY.flattenOffset();
        // Calculate final position from current offset + gesture delta
        const newTranslateY = lastTranslateY.current + gestureState.dy;
        const visibleHeight = screenHeight - BASE_POSITION_PIXELS; // 65% of screen
        const minTranslateY = innerContainerHeightRef.current > visibleHeight 
          ? -(innerContainerHeightRef.current - visibleHeight) 
          : -BASE_POSITION_PIXELS;
        const finalTranslateY = Math.max(minTranslateY, Math.min(0, newTranslateY));
        
        const velocity = gestureState.vy;
        let targetTranslateY: number;
        
        // Use unconstrained newTranslateY to detect drag intent (down = positive, up = negative)
        // translateY values: 0 = base (35%), negative = up, positive = down (would close)
        // Only close if dragging down from top/base position (not from minTranslateY position)
        const isNearMinTranslateY = finalTranslateY <= minTranslateY * 1.1; // Within 10% of min
        const isNearBaseOrTop = finalTranslateY >= -BASE_POSITION_PIXELS * 1.2 && finalTranslateY <= BASE_POSITION_PIXELS * 0.2;
        
        if (velocity > 0.5 && isNearBaseOrTop) {
          // Swiping down fast from top/base position - close it
          targetTranslateY = INITIAL_OFFSET;
        } else if (velocity < -0.5) {
          // Swiping up fast - snap to top (or minTranslateY if content is tall and we're going past top)
          targetTranslateY = minTranslateY < -BASE_POSITION_PIXELS ? minTranslateY : -BASE_POSITION_PIXELS;
        } else {
          // Snap to nearest: top (-BASE_POSITION_PIXELS), base (0), or minTranslateY if content is tall
          const midPoint = -BASE_POSITION_PIXELS / 2;
          
          // If content is tall and we're near the bottom, snap to minTranslateY to show bottom
          if (isNearMinTranslateY && finalTranslateY <= minTranslateY * 0.95) {
            // Near or at minimum position (showing bottom of tall content) - stay there
            targetTranslateY = minTranslateY;
          } else if (finalTranslateY < midPoint) {
            // Between minTranslateY and midPoint - if dragging down from min, go to top
            if (isNearMinTranslateY && gestureState.dy > 0) {
              // Dragging down from bottom position - go back to top
              targetTranslateY = minTranslateY < -BASE_POSITION_PIXELS ? 
                -BASE_POSITION_PIXELS : -BASE_POSITION_PIXELS;
            } else {
              // Otherwise snap to top if minTranslateY allows
              targetTranslateY = minTranslateY < -BASE_POSITION_PIXELS ? 
                Math.max(minTranslateY, -BASE_POSITION_PIXELS) : -BASE_POSITION_PIXELS;
            }
          } else if (gestureState.dy > 0 && gestureState.dy > BASE_POSITION_PIXELS * 0.5 && isNearBaseOrTop) {
            // Dragging down significantly from base position - close it
            targetTranslateY = INITIAL_OFFSET;
          } else {
            targetTranslateY = 0; // Snap to base
          }
        }

        if (targetTranslateY >= INITIAL_OFFSET * 0.9) {
          // Closing - animate translateY back to hidden
          lastTranslateY.current = INITIAL_OFFSET;
          Animated.timing(slideoutTranslateY, {
            toValue: INITIAL_OFFSET,
            duration: 300,
            useNativeDriver: true,
          }).start(() => {
            setIsSlideoutVisible(false);
            setSelectedJob(null);
            scrollOffsetY.current = 0;
          });
        } else {
          // Stay open - animate translateY
          lastTranslateY.current = targetTranslateY;
          Animated.spring(slideoutTranslateY, {
            toValue: targetTranslateY,
            useNativeDriver: true,
            tension: 70,
            friction: 12,
          }).start(() => {
            if (targetTranslateY <= -BASE_POSITION_PIXELS * 0.9) {
              setIsExpanded(true);
            } else {
              setIsExpanded(false);
            }
            scrollViewRef.current?.scrollTo({ y: 0, animated: false });
            scrollOffsetY.current = 0;
          });
        }
      },
    })
  ).current;

  const handleJobPress = async (job: Job) => {
    setIsLoadingJobDetails(true);
    setSelectedJob(job);
    setIsSlideoutVisible(true);
    
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }

      console.log('📞 Fetching job details for job ID:', job.id);
      const response = await apiClient.get(`/jobs/${job.id}`);
      console.log('✅ Job details response:', response.data);
      const fullJob = response.data.job;
      setSelectedJob(fullJob);
    } catch (error: any) {
      console.error('❌ Error fetching job details:', error);
      Alert.alert('Error', `Failed to load job details: ${error.response?.status || 'Unknown error'}`);
    } finally {
      setIsLoadingJobDetails(false);
    }
  };

  const closeSlideout = () => {
    setIsSlideoutVisible(false);
    setSelectedJob(null);
  };

  const handleCopy = (text: string) => {
    setToastVisible(true);
    Animated.sequence([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.delay(1000),
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setToastVisible(false);
    });
  };

  const handleToggleJobCompletion = async (job: Job, e?: any) => {
    if (e) {
      e.stopPropagation(); // Prevent triggering job card press
    }
    
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }
      
      const newStatus = job.status === 'completed' ? 'scheduled' : 'completed';
      
      await apiClient.put(`/jobs/${job.id}/status`, {
        status: newStatus,
      });
      
      // Update local state
      setJobs(prevJobs =>
        prevJobs.map(j => j.id === job.id ? { ...j, status: newStatus } : j)
      );
      
      // If this is the selected job, update it too
      if (selectedJob && selectedJob.id === job.id) {
        setSelectedJob({ ...selectedJob, status: newStatus });
      }
    } catch (error: any) {
      console.error('Error toggling job completion:', error);
      Alert.alert('Error', 'Failed to update job status. Please try again.');
    }
  };

  const fetchDayJobs = async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }

      const response = await apiClient.get(`/jobs?start_date=${date}&end_date=${date}`);
      const allJobs = response.data.jobs || [];
      
      // Filter jobs for the logged-in user only
      const userJobs = allJobs.filter((job: Job) => job.assigned_user_id === user.id);
      
      setJobs(userJobs);
    } catch (error: any) {
      console.error('Error fetching day jobs:', error);
      Alert.alert('Error', 'Failed to load jobs for this day');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    // Add time to avoid timezone issues when parsing YYYY-MM-DD format
    const date = new Date(dateString + 'T00:00:00');
    // Use toLocaleDateString to get the full weekday name (avoids any manual array issues)
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return { dayName, formatted: `${day}/${month}/${year}` };
  };

  const formatTime = (timeFrom?: string, timeTo?: string) => {
    if (!timeFrom || !timeTo) return null;
    return `${timeFrom} - ${timeTo}`;
  };

  const formatDuration = (minutes?: number) => {
    if (!minutes) return null;
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins} min` : `${hours}h`;
  };

  // Get month index from date string (format: YYYY-MM-DD)
  const getMonthFromDate = (dateString: string): number => {
    const dateObj = new Date(dateString + 'T00:00:00'); // Add time to avoid timezone issues
    return dateObj.getMonth();
  };

  const { dayName, formatted } = formatDate(date);

  if (isLoading) {
    return (
      <View style={styles.dayViewContainer}>
        <View style={styles.dayViewHeader}>
          <Image 
            source={monthBanners[getMonthFromDate(date)]} 
            style={styles.dayViewHeaderImage}
            resizeMode="cover"
          />
          <View style={styles.dayViewHeaderOverlay}>
            <View style={styles.dayViewHeaderContent}>
              <View style={styles.dayViewHeaderLeft}>
                <Text style={styles.dayViewDayName}>{dayName}</Text>
                <Text style={styles.dayViewDate}>{formatted}</Text>
              </View>
            </View>
          </View>
        </View>
        <View style={styles.dayViewLoading}>
          <Text style={styles.loadingText}>Loading jobs...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.dayViewContainer}>
      {/* Header */}
      <View style={styles.dayViewHeader}>
        <Image 
          source={monthBanners[getMonthFromDate(date)]} 
          style={styles.dayViewHeaderImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['rgba(61, 213, 122, 0.6)', 'rgba(61, 213, 122, 1)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.dayViewHeaderOverlay}
          pointerEvents="box-none"
        >
          <View style={styles.dayViewHeaderContent}>
            <View style={styles.dayViewHeaderLeft}>
              <Text style={styles.dayViewDayName}>{dayName}</Text>
              <Text style={styles.dayViewDate}>{formatted}</Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* Jobs List */}
      <View style={styles.dayViewJobsWrapper}>
        <FlatList
          data={jobs}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.dayViewJobsList}
          renderItem={({ item }) => {
            const clientName = `${item.name || ''} ${item.last_name || ''}`.trim();
            const address = item.address ? `${item.address}${item.zip_code && item.city ? ' • ' : ''}${item.zip_code || ''} ${item.city || ''}`.trim() : '';
            const timeRange = formatTime(item.scheduled_time_from, item.scheduled_time_to);
            const duration = formatDuration(item.total_duration);
            const isCompleted = item.status === 'completed';
            const isCancelled = item.status === 'cancelled';
            const taskCount = item.service_count || 0;

            return (
              <TouchableOpacity 
                style={[
                  styles.jobCard, 
                  isCompleted && styles.jobCardCompleted,
                  isCancelled && styles.jobCardCancelled,
                ]}
                activeOpacity={0.7}
                onPress={() => handleJobPress(item)}
              >
                <View style={styles.jobCardBadge}>
                  <Text style={styles.jobCardBadgeText}>{taskCount}</Text>
                </View>
                
                <Text style={styles.jobCardClientName}>{clientName || 'Unknown Client'}</Text>
                
                {address && (
                  <Text style={styles.jobCardAddress}>{address}</Text>
                )}
                
                {timeRange && (
                  <View style={styles.jobCardTimeRow}>
                    <Text style={styles.jobCardTimeIcon}>🕐</Text>
                    <Text style={styles.jobCardTime}>{timeRange}</Text>
                  </View>
                )}
                
                <View style={styles.jobCardSeparator} />
                
                <View style={styles.jobCardBar}>
                  <View style={styles.jobCardBarLeft}>
                    <Text style={styles.jobCardBarIcon}>📋</Text>
                    <Text style={styles.jobCardBarText}>{taskCount} tasks</Text>
                  </View>
                  {duration && (
                    <View style={styles.jobCardBarRight}>
                      <Text style={styles.jobCardBarIcon}>⏱️</Text>
                      <Text style={styles.jobCardBarText}>{duration}</Text>
                    </View>
                  )}
                  <TouchableOpacity 
                    style={styles.jobCardCheckbox}
                    onPress={(e) => handleToggleJobCompletion(item, e)}
                    activeOpacity={0.7}
                  >
                    {isCompleted ? (
                      <View style={styles.jobCardCheckboxChecked}>
                        <Text style={styles.jobCardCheckmark}>✓</Text>
                      </View>
                    ) : isCancelled ? (
                      <View style={styles.jobCardCheckboxCancelled}>
                        <Text style={styles.jobCardCheckmarkCancelled}>✕</Text>
                      </View>
                    ) : (
                      <View style={styles.jobCardCheckboxUnchecked}>
                        <Text style={styles.jobCardCheckmarkUnchecked}>✓</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.dayViewEmpty}>
              <Text style={styles.dayViewEmptyText}>No jobs scheduled for this day</Text>
            </View>
          }
        />
      </View>

      {/* Job Detail Slideout */}
      {isSlideoutVisible && (
        <>
          <TouchableWithoutFeedback onPress={closeSlideout}>
            <View style={styles.slideoutOverlay} />
          </TouchableWithoutFeedback>
          {/* Outer container - fixed, full screen, transparent, overflow hidden */}
          <View style={styles.slideoutOuterContainer}>
            {/* Inner container - follows finger, auto height */}
            <Animated.View
              {...panResponder.panHandlers}
              style={[
                styles.slideoutInnerContainer,
                isExpanded && styles.slideoutInnerContainerExpanded,
                { 
                  top: `${COLLAPSED_POSITION}%`, // Fixed at 35% - dragging uses translateY
                  transform: [
                    { translateY: slideoutTranslateY },
                    { translateY: keyboardOffsetY }, // Additional offset for keyboard
                  ],
                }
              ]}
              onLayout={(event) => {
                innerContainerHeightRef.current = event.nativeEvent.layout.height;
              }}
            >
            {isLoadingJobDetails ? (
              <View style={styles.slideoutLoading}>
                <Text style={styles.loadingText}>Loading job details...</Text>
              </View>
            ) : selectedJob ? (
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
                keyboardVerticalOffset={0}
                enabled={Platform.OS === 'ios'}
              >
                <ScrollView
                  ref={scrollViewRef}
                  style={styles.sheetContent}
                  contentContainerStyle={styles.sheetContentContainer}
                  showsVerticalScrollIndicator={true}
                  scrollEventThrottle={16}
                  onScroll={(event) => {
                    scrollOffsetY.current = event.nativeEvent.contentOffset.y;
                  }}
                  scrollEnabled={isExpanded || lastTranslateY.current < -BASE_POSITION_PIXELS * 0.5}
                  bounces={true}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="interactive"
                >
                  <JobDetailSlideout
                    job={selectedJob}
                    date={date}
                    onClose={closeSlideout}
                    onCopy={handleCopy}
                    isExpanded={isExpanded}
                    onJobUpdate={(updatedJob) => {
                      setSelectedJob(updatedJob);
                      // Update the job in the jobs list immediately
                      setJobs(prevJobs =>
                        prevJobs.map(j => j.id === updatedJob.id ? updatedJob : j)
                      );
                    }}
                    scrollViewRef={scrollViewRef}
                    scrollOffsetYRef={scrollOffsetY}
                  />
                </ScrollView>
              </KeyboardAvoidingView>
            ) : null}
            </Animated.View>
          </View>
        </>
      )}

      {/* Bottom Navigation */}
      {company && user && !isSlideoutVisible && (
        <View style={styles.bottomNavContainer}>
          <TouchableOpacity 
            style={styles.bottomNavItem}
            onPress={() => navigation.navigate('CompanyTabs', { company, user, initialTab: 'Overview' })}
          >
            <OverviewIcon color="#193434" />
            <Text style={styles.bottomNavLabel}>Overview</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.bottomNavItem}
            onPress={() => navigation.navigate('CompanyTabs', { company, user, initialTab: 'Calender' })}
          >
            <CalendarIcon color="#193434" />
            <Text style={styles.bottomNavLabel}>Calender</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.bottomNavItem}
            onPress={() => navigation.navigate('CompanyTabs', { company, user, initialTab: 'Today' })}
          >
            <TodayIcon color="#193434" />
            <Text style={styles.bottomNavLabel}>Today</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Toast Notification */}
      {toastVisible && (
        <Animated.View style={[styles.toastContainer, { opacity: toastOpacity }]}>
          <Text style={styles.toastText}>Copied to clipboard</Text>
        </Animated.View>
      )}
    </View>
  );
}

function CompanyTabsScreen({ route }: any) {
  const { company, user, initialTab } = route.params || {};

  return (
    <Tab.Navigator
      initialRouteName={initialTab || 'Overview'}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: '#3DD57A',
        tabBarInactiveTintColor: '#193434',
        tabBarIcon: ({ color }) => {
          if (route.name === 'Overview') {
            return <OverviewIcon color={color} />;
          } else if (route.name === 'Calender') {
            return <CalendarIcon color={color} />;
          } else if (route.name === 'Today') {
            return <TodayIcon color={color} />;
          }
          return null;
        },
        tabBarLabel: ({ focused, color }) => (
          <View style={styles.tabLabelContainer}>
            <Text style={[styles.tabLabel, { color }]}>{route.name === 'Today' ? 'Today' : route.name}</Text>
            {focused && <View style={styles.activeIndicator} />}
          </View>
        ),
      })}
    >
      <Tab.Screen 
        name="Overview" 
        component={OverviewTab}
        initialParams={{ company, user }}
      />
      <Tab.Screen 
        name="Calender" 
        component={CalendarTab}
        initialParams={{ company, user }}
      />
      <Tab.Screen 
        name="Today" 
        component={TodayTab}
        initialParams={{ company, user }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Companies" component={CompaniesScreen} />
        <Stack.Screen name="CompanyTabs" component={CompanyTabsScreen} />
        <Stack.Screen 
          name="DayView" 
          component={DayViewScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  // Login screen styles
  container: {
    flex: 1,
    backgroundColor: '#F6F9F7',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loginContainer: {
    width: '100%',
    maxWidth: 400,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#193434',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#193434',
    textAlign: 'center',
    marginBottom: 32,
    opacity: 0.8,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#193434',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#19343420',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#193434',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  passwordContainer: {
    position: 'relative',
  },
  passwordInput: {
    borderWidth: 1,
    borderColor: '#19343420',
    borderRadius: 12,
    padding: 16,
    paddingRight: 50, // Make room for eye icon
    fontSize: 16,
    color: '#193434',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  eyeIcon: {
    position: 'absolute',
    right: 16,
    top: 16,
    padding: 4,
  },
  eyeIconText: {
    fontSize: 16,
  },
  loginButton: {
    backgroundColor: '#3DD57A',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#3DD57A',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  loginButtonDisabled: {
    opacity: 0.6,
    shadowOpacity: 0.1,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  forgotPassword: {
    alignItems: 'center',
    marginTop: 16,
  },
  forgotPasswordText: {
    color: '#193434',
    fontSize: 14,
    opacity: 0.7,
  },

  // Companies screen styles
  companiesContainer: {
    flex: 1,
    backgroundColor: '#F6F9F7',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  companiesTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#193434',
    textAlign: 'center',
    marginBottom: 30,
  },
  companiesList: {
    paddingBottom: 20,
  },
  companyContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  companyContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  },
  companyInfo: {
    flex: 1,
  },
  companyName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#193434',
    marginBottom: 4,
  },
  companyRole: {
    fontSize: 14,
    color: '#193434',
    opacity: 0.7,
    textTransform: 'capitalize',
  },
  arrowContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrow: {
    fontSize: 20,
    color: '#193434',
    opacity: 0.5,
  },

  // Loading styles
  loadingContainer: {
    flex: 1,
    backgroundColor: '#F6F9F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#193434',
    opacity: 0.7,
  },

  // Company overview styles
  overviewContainer: {
    flex: 1,
    backgroundColor: '#F6F9F7',
  },
  headerContainer: {
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
  },
  headerCompany: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#193434',
    marginBottom: 4,
  },
  headerUser: {
    fontSize: 14,
    color: '#193434',
    opacity: 0.7,
  },
  headerIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#F6F9F7',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 16,
  },
  iconText: {
    fontSize: 24,
  },
  contentPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  placeholderText: {
    fontSize: 16,
    color: '#193434',
    opacity: 0.6,
    textAlign: 'center',
  },

  // Tab bar styles
  tabBar: {
    backgroundColor: '#fff',
    borderTopWidth: 0,
    height: 80,
    paddingTop: 10,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 10,
  },
  tabContainer: {
    flex: 1,
    backgroundColor: '#F6F9F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabPlaceholderText: {
    fontSize: 18,
    color: '#193434',
    opacity: 0.5,
  },
  tabLabelContainer: {
    alignItems: 'center',
    marginTop: 4,
  },
  tabLabel: {
    fontSize: 12,
  },
  activeIndicator: {
    width: 40,
    height: 3,
    backgroundColor: '#3DD57A',
    borderRadius: 2,
    marginTop: 6,
  },

  // Calendar styles
  calendarContainer: {
    flex: 1,
    backgroundColor: '#F6F9F7',
  },
  calendarTopSpace: {
    height: 50,
    backgroundColor: '#F6F9F7',
  },
  calendarBanner: {
    position: 'relative',
    height: 120,
    borderRadius: 16,
    marginHorizontal: 8,
    marginBottom: 16,
    overflow: 'hidden',
  },
  calendarBannerImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  calendarBannerOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  calendarYear: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
    marginBottom: 4,
  },
  calendarMonth: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  weekDaysRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  weekDayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  weekDayText: {
    fontSize: 12,
    color: '#193434',
    opacity: 0.6,
    fontWeight: '500',
    paddingEnd: 2,
  },
  calendarGrid: {
    flex: 1,
    paddingHorizontal: 8,
  },
  calendarWeekRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  calendarDayCell: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: '#fff',
    marginHorizontal: 2,
    marginVertical: 2,
    borderRadius: 8,
    minHeight: 70,
    position: 'relative',
    overflow: 'visible',
  },
  calendarDayContent: {
    flex: 1,
    padding: 8,
    justifyContent: 'space-between',
  },
  calendarDayText: {
    fontSize: 14,
    color: '#193434',
    fontWeight: '500',
    paddingEnd: 2,
  },
  calendarDayTextCurrent: {
    color: '#193434',
    fontWeight: 'bold',
  },
  currentDayIndicator: {
    position: 'absolute',
    bottom: -3,
    left: '50%',
    marginLeft: -15,
    width: 30,
    height: 6,
    backgroundColor: '#3DD57A',
    borderRadius: 3,
  },
  jobDotsContainer: {
    marginTop: 4,
    alignItems: 'flex-start',
    width: '100%',
  },
  jobDotsRow: {
    flexDirection: 'row',
    marginBottom: 3,
    flexWrap: 'wrap',
  },
  jobDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#193434',
    opacity: 0.4,
    marginRight: 3,
    marginBottom: 1,
  },
  jobDotCompleted: {
    backgroundColor: '#3DD57A',
    opacity: 1,
  },
  jobDotCancelled: {
    backgroundColor: '#FF6B6B',
    opacity: 1,
  },

  // Month selector styles
  yearSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    marginBottom: 8,
  },
  yearArrow: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  yearArrowText: {
    fontSize: 24,
    color: '#193434',
    fontWeight: '300',
  },
  yearSelectorText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#193434',
    minWidth: 80,
    textAlign: 'center',
  },
  monthListContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  monthCard: {
    backgroundColor: '#193434',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginBottom: 8,
    minHeight: 90,
    position: 'relative',
  },
  monthCardActive: {
    backgroundColor: '#3DD57A',
  },
  monthCardText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    position: 'absolute',
    bottom: 20,
    left: 20,
  },
  monthCardTextActive: {
    color: '#fff',
  },
  workDaysContainer: {
    position: 'absolute',
    top: 16,
    right: 20,
    alignItems: 'flex-end',
  },
  workDaysLabel: {
    fontSize: 11,
    color: '#fff',
    opacity: 0.7,
    marginBottom: 2,
  },
  workDaysLabelActive: {
    opacity: 0.9,
  },
  workDaysNumber: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  workDaysNumberActive: {
    color: '#fff',
  },
  thisMonthButton: {
    alignSelf: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 36,
    paddingVertical: 14,
    borderRadius: 25,
    marginTop: 16,
    marginBottom: 20,
    minWidth: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thisMonthButtonText: {
    color: '#193434',
    fontSize: 14,
    fontWeight: '600',
    includeFontPadding: false,
    textAlign: 'center',
    paddingEnd: 2,
  },

  // Day view styles
  dayViewContainer: {
    flex: 1,
    backgroundColor: '#F6F9F7',
  },
  dayViewJobsWrapper: {
    backgroundColor: '#F6F9F7',
    width: '100%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    marginTop: -20,
    paddingTop: 20,
  },
  dayViewHeader: {
    position: 'relative',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingTop: 100,
    paddingBottom: 12,
    paddingHorizontal: 0,
    marginHorizontal: 0,
    width: '100%',
    overflow: 'hidden',
    minHeight: 180,
    justifyContent: 'center',
  },
  dayViewHeaderImage: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  dayViewHeaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  dayViewHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    zIndex: 1,
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  dayViewHeaderLeft: {
    alignItems: 'center',
    paddingHorizontal: 8,
    minWidth: 250,
  },
  dayViewDayName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
    includeFontPadding: false,
    textAlign: 'center',
    letterSpacing: 0.5,
    paddingEnd: 2,
  },
  dayViewDate: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
    includeFontPadding: false,
    textAlign: 'center',
    paddingEnd: 2,
  },
  dayViewHeaderRight: {
    width: 100,
    height: 60,
  },
  dayViewJobsList: {
    padding: 16,
    paddingBottom: 100, // Space for bottom navigation
    backgroundColor: 'transparent',
  },
  dayViewLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayViewEmpty: {
    padding: 40,
    alignItems: 'center',
  },
  dayViewEmptyText: {
    fontSize: 16,
    color: '#193434',
    opacity: 0.5,
  },
  
  // Job card styles
  jobCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F8F4',
    padding: 16,
    marginBottom: 12,
    position: 'relative',
  },
  jobCardCompleted: {
    backgroundColor: '#E8F5E9',
    borderLeftWidth: 4,
    borderLeftColor: '#3DD57A',
  },
  jobCardCancelled: {
    backgroundColor: '#FFEBEE',
    borderLeftWidth: 4,
    borderLeftColor: '#FF6B6B',
  },
  jobCardBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#FF6B6B',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jobCardBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  jobCardClientName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#193434',
    marginBottom: 6,
    paddingRight: 40,
  },
  jobCardAddress: {
    fontSize: 14,
    color: '#193434',
    opacity: 0.7,
    marginBottom: 8,
  },
  jobCardTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  jobCardTimeIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  jobCardTime: {
    fontSize: 14,
    color: '#193434',
    opacity: 0.7,
  },
  jobCardSeparator: {
    height: 1,
    backgroundColor: '#193434',
    opacity: 0.1,
    marginBottom: 12,
  },
  jobCardBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  jobCardBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  jobCardBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  jobCardBarIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  jobCardBarText: {
    fontSize: 14,
    color: '#193434',
    opacity: 0.6,
  },
  jobCardCheckbox: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  jobCardCheckboxChecked: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#3DD57A',
    borderWidth: 2,
    borderColor: '#3DD57A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  jobCardCheckboxCancelled: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FF6B6B',
    borderWidth: 2,
    borderColor: '#FF6B6B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  jobCardCheckboxUnchecked: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
  },
  jobCardCheckmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  jobCardCheckmarkUnchecked: {
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: 'bold',
  },
  jobCardCheckmarkCancelled: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },

  // Job detail slideout styles
  slideoutOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1000,
  },
  slideoutOuterContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
    overflow: 'hidden',
    zIndex: 1001,
  },
  slideoutInnerContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    width: '100%',
    height: 'auto',
    backgroundColor: '#F6F9F7',
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    overflow: 'hidden', // Clip corners to prevent white background from showing
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
  },
  slideoutInnerContainerExpanded: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  bottomSheetBackground: {
    backgroundColor: '#F6F9F7',
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
  },
  bottomSheetIndicator: {
    backgroundColor: '#193434',
    opacity: 0.3,
    width: 40,
    height: 4,
  },
  jobDetailSlideout: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '85%',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: {
      width: -2,
      height: 0,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1000,
  },
  popupContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    backgroundColor: '#F6F9F7',
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 1001,
  },
  jobDetailSlideoutBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    backgroundColor: '#F6F9F7',
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 1001,
    overflow: 'hidden',
  },
  jobDetailSlideoutExpanded: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    overflow: 'visible',
  },
  dragHandleContainer: {
    width: '100%',
    paddingTop: 8,
    paddingBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F6F9F7',
    zIndex: 10,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#193434',
    opacity: 0.3,
    borderRadius: 2,
  },
  sheetHandle: {
    width: '100%',
    paddingTop: 12,
    paddingBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  sheetHandleBar: {
    width: 40,
    height: 4,
    backgroundColor: '#193434',
    opacity: 0.5,
    borderRadius: 2,
  },
  sheetContent: {
    flex: 1,
  },
  sheetContentContainer: {
    paddingBottom: 40,
  },
  slideoutLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  jobDetailContainer: {
    backgroundColor: '#F6F9F7',
  },
  jobDetailHeaderActions: {
    position: 'absolute',
    top: 36,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 10,
  },
  jobDetailActionButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionsIcon: {
    width: 20,
    height: 20,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  optionsDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#fff',
    opacity: 0.8,
    marginVertical: 1.5,
  },
  completeIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.8,
  },
  completeIconActive: {
    backgroundColor: '#3DD57A',
    borderColor: '#3DD57A',
    opacity: 1,
  },
  completeCheckmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    opacity: 0.8,
  },
  completeCheckmarkActive: {
    opacity: 1,
  },
  optionsMenu: {
    position: 'absolute',
    top: 72,
    left: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 8,
    minWidth: 120,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 20,
  },
  optionsMenuItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  optionsMenuText: {
    fontSize: 14,
    color: '#193434',
    fontWeight: '500',
  },
  jobDetailCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  jobDetailCloseText: {
    fontSize: 18,
    color: '#fff',
    fontWeight: 'bold',
  },
  jobDetailHeader: {
    backgroundColor: '#193434',
    paddingTop: 16, // Increased from 8
    paddingBottom: 24,
    paddingHorizontal: 20,
    position: 'relative',
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
  },
  jobDetailHeaderExpanded: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingTop: 8,
  },
  sheetHandleInHeader: {
    width: '100%',
    paddingTop: 8,
    paddingBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  sheetHandleBarInHeader: {
    width: 40,
    height: 4,
    backgroundColor: '#193434',
    opacity: 0.6,
    borderRadius: 2,
  },
  jobDetailClientName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
    marginBottom: 8,
  },
  jobDetailClientType: {
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  jobDetailClientTypeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  jobDetailSeparator: {
    height: 1,
    backgroundColor: '#fff',
    opacity: 0.3,
    marginBottom: 16,
  },
  jobDetailContactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  jobDetailIconWrapper: {
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    width: 16,
    height: 16,
  },
  jobDetailContactIcon: {
    fontSize: 16,
    marginRight: 16,
    width: 15,
    height: 12,
  },
  jobDetailContactText: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
  },
  jobDetailContent: {
    flex: 1,
    padding: 20,
  },
  jobDetailSection: {
    marginBottom: 24,
  },
  jobDetailSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#193434',
    marginBottom: 16,
  },
  jobDetailInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  jobDetailInfoIcon: {
    fontSize: 18,
    marginRight: 16,
    marginTop: 2,
    width: 16,
    height: 18,
  },
  jobDetailInfoText: {
    fontSize: 14,
    color: '#193434',
    flex: 1,
    lineHeight: 20,
  },
  jobDetailTasksSection: {
    marginBottom: 24,
  },
  jobDetailTasksHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  jobDetailTasksTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  jobDetailTasksCount: {
    fontSize: 14,
    color: '#193434',
    opacity: 0.6,
  },
  jobDetailTaskItemContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 12,
    padding: 16,
  },
  jobDetailTaskItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  jobDetailTaskCheckbox: {
    marginRight: 12,
  },
  jobDetailTaskCheckboxChecked: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#3DD57A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  jobDetailTaskCheckboxUnchecked: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
  },
  jobDetailTaskCheckmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  jobDetailTaskCheckmarkUnchecked: {
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: 'bold',
  },
  jobDetailTaskContent: {
    flex: 1,
  },
  jobDetailTaskName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#193434',
    marginBottom: 4,
  },
  jobDetailTaskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  jobDetailTaskMetaText: {
    fontSize: 13,
    color: '#193434',
    opacity: 0.6,
  },
  jobDetailNoTasks: {
    fontSize: 14,
    color: '#193434',
    opacity: 0.5,
    textAlign: 'center',
    paddingVertical: 20,
  },
  jobDetailTotalBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  jobDetailTotalLeft: {
    flex: 1,
  },
  jobDetailTotalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#193434',
    marginBottom: 4,
  },
  jobDetailTotalTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  jobDetailTotalTimeIcon: {
    marginRight: 10,
    width: 16,
    height: 16,
  },
  jobDetailTotalTime: {
    fontSize: 13,
    color: '#193434',
    opacity: 0.7,
  },
  jobDetailTotalPrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#3DD57A',
  },

  // Bottom navigation (for DayView and other screens)
  bottomNavContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopWidth: 0,
    height: 80,
    paddingTop: 10,
    paddingBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 10,
  },
  bottomNavItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  bottomNavLabel: {
    fontSize: 12,
    color: '#193434',
    marginTop: 4,
  },
  jobDetailTimelineSection: {
    marginTop: 24,
    // No paddingHorizontal - matches jobDetailTasksSection (padding comes from jobDetailContent)
  },
  timelineContainer: {
    marginTop: 16,
    paddingLeft: 0,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 16,
    position: 'relative',
    // No paddingLeft/Right - matches task item structure (padding comes from jobDetailContent)
  },
  timelineLeft: {
    width: 20,
    alignItems: 'center',
    marginRight: 16,
    position: 'relative',
  },
  timelineLine: {
    position: 'absolute',
    left: 9,
    top: 12,
    bottom: -16,
    width: 2,
    backgroundColor: '#BFD1C5',
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#193434',
    borderWidth: 2,
    borderColor: '#F6F9F7',
    zIndex: 1,
  },
  timelineContent: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: -4,
  },
  timelineText: {
    fontSize: 14,
    color: '#193434',
    lineHeight: 20,
    marginBottom: 4,
  },
  timelineDate: {
    fontSize: 12,
    color: '#193434',
    opacity: 0.6,
  },
  addNoteButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#3DD57A',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 16,
    marginLeft: 20,
    minWidth: 120,
  },
  addNoteButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    includeFontPadding: false,
    textAlign: 'center',
  },
  noteInputContainer: {
    marginTop: 16,
    paddingHorizontal: 20, // Match timeline section padding
    // No background - just spacing
  },
  noteInput: {
    minHeight: 100,
    fontSize: 14,
    color: '#193434',
    textAlignVertical: 'top',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    // Width matches timeline content (full width minus paddingHorizontal: 20)
  },
  noteInputActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  noteIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteSaveIconButton: {
    backgroundColor: '#3DD57A',
  },
  noteSaveButtonDisabled: {
    opacity: 0.6,
  },
  noteCancelIcon: {
    color: '#193434',
    fontSize: 20,
    fontWeight: 'bold',
  },
  noteSaveIcon: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  toastContainer: {
    position: 'absolute',
    bottom: 100,
    left: '50%',
    marginLeft: -100,
    width: 200,
    backgroundColor: '#193434',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 10,
  },
  toastText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
});
