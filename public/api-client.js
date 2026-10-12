// API Client for booking system

const API_BASE = 'http://localhost:3000/api';

class BookingAPI {
  static async createBooking(bookingData) {
    try {
      const response = await fetch(`${API_BASE}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create booking');
      }

      return await response.json();
    } catch (err) {
      console.error('API Error:', err);
      throw err;
    }
  }

  static async getBookingStatus(bookingId) {
    try {
      const response = await fetch(`${API_BASE}/bookings/${bookingId}`);

      if (!response.ok) {
        throw new Error('Booking not found');
      }

      return await response.json();
    } catch (err) {
      console.error('API Error:', err);
      throw err;
    }
  }

  static async getTaskEvents(taskId) {
    try {
      const response = await fetch(`${API_BASE}/tasks/${taskId}/events`);

      if (!response.ok) {
        throw new Error('Failed to fetch events');
      }

      return await response.json();
    } catch (err) {
      console.error('API Error:', err);
      throw err;
    }
  }

  static async getAllTasks() {
    try {
      const response = await fetch(`${API_BASE}/debug/tasks`);

      if (!response.ok) {
        throw new Error('Failed to fetch tasks');
      }

      return await response.json();
    } catch (err) {
      console.error('API Error:', err);
      throw err;
    }
  }
}
