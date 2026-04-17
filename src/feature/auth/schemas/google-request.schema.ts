import { GoogleProfile } from './google-profile.schema';

export type GoogleRequest = Request & { user: GoogleProfile };
