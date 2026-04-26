interface JobType {
  id: string;
  bidPlaced: boolean;
}

export interface ScrapedJobType {
  id?: string;
  title: string;
  url: string;
  desc: string;
  category: string;
  price: string;
  suggestions: string;
  daysLeft: string;
  deadline: string;
  postedDate: string;
  employer: string;
  employerUrl: string;
  employerAvatar: string;
  tags?: string[];
  workType?: string;
}

export default JobType;
