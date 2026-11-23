import { knowledgeService } from '../services/knowledgeService';

/**
 * Business Advisor + Startup Mentor knowledge base.
 * Distinct from WEVYSYA_KNOWLEDGE (app/platform FAQ) — this content grounds
 * general business-advisory and startup-mentorship voice questions.
 */
export const BUSINESS_ADVISOR_KNOWLEDGE = [
  {
    content: `When pricing a service, don't just match competitors — price on the value delivered. Calculate the cost the client avoids or the revenue they gain by using your service, and price as a fraction of that. Undercutting on price attracts price-sensitive clients who churn first; competing on value and outcomes builds a more loyal client base.`,
    metadata: { title: 'Pricing Your Services', category: 'business_advisory', source: 'core_knowledge' },
  },
  {
    content: `Before scaling a business, make sure the core unit economics work at small volume first — if you lose money on one customer, you'll lose money faster on a thousand. Scale the parts that are already profitable and repeatable, not the parts that still need experimentation.`,
    metadata: { title: 'When to Scale', category: 'business_advisory', source: 'core_knowledge' },
  },
  {
    content: `Hire only when a task is both recurring and outside your highest-value work. A common mistake is hiring too early for roles that founders should still do themselves to understand the work, or hiring too late for repetitive tasks that are draining founder time away from growth.`,
    metadata: { title: 'When to Hire', category: 'business_advisory', source: 'core_knowledge' },
  },
  {
    content: `Cash flow problems usually come from timing, not profitability — you can be profitable on paper and still run out of cash if receivables are slow and payables are due sooner. Track cash flow weekly, not just profit monthly, and negotiate payment terms with clients and vendors to align the timing.`,
    metadata: { title: 'Cash Flow Basics', category: 'business_advisory', source: 'core_knowledge' },
  },
  {
    content: `Basic compliance every small business should track: GST registration and filing if turnover crosses the threshold, timely TDS deduction and deposit if you pay contractors or employees, and maintaining basic bookkeeping records from day one — retrofitting books after two years is far more expensive than doing it monthly.`,
    metadata: { title: 'Compliance Basics for Small Business', category: 'business_advisory', source: 'core_knowledge' },
  },
  {
    content: `Before building a full product, validate the idea by getting 10-20 potential customers to describe the problem in their own words, without you mentioning your solution. If they can't clearly describe a painful, frequent problem, the idea needs more validation before you invest in building.`,
    metadata: { title: 'Validating a Startup Idea', category: 'startup_mentorship', source: 'core_knowledge' },
  },
  {
    content: `An MVP should be the smallest thing that lets you test your riskiest assumption — usually "will people pay for this," not "does every feature work perfectly." Ship something narrow, get 5-10 real paying or committed users, and let their behavior (not their opinions) tell you what to build next.`,
    metadata: { title: 'Building Your MVP', category: 'startup_mentorship', source: 'core_knowledge' },
  },
  {
    content: `Look for a co-founder who is strong exactly where you are weak, not someone who mirrors your own skills. The most common startup co-founder breakups come from unclear equity splits and unclear decision-making authority early on — settle both explicitly in writing before building anything together.`,
    metadata: { title: 'Finding a Co-Founder', category: 'startup_mentorship', source: 'core_knowledge' },
  },
  {
    content: `Raise money when you have a specific, measurable milestone the capital will get you to (e.g. "18 months of runway to reach X revenue"), not simply because fundraising is available. Bootstrapping longer preserves equity and forces discipline; raise only when growth is capital-constrained, not idea-constrained.`,
    metadata: { title: 'When to Raise Funding', category: 'startup_mentorship', source: 'core_knowledge' },
  },
];

/**
 * Load business advisor + startup mentorship knowledge into the database.
 * Safe to call repeatedly — upsertDocument skips existing non-refreshing docs.
 */
export async function seedBusinessAdvisorKnowledge(): Promise<void> {
  console.log('📚 Loading Business Advisor knowledge base...');
  try {
    await knowledgeService.loadKnowledgeBase(BUSINESS_ADVISOR_KNOWLEDGE, 'business_advisor');
    console.log('✅ Business Advisor knowledge base loaded successfully!');
  } catch (error) {
    console.error('❌ Failed to load Business Advisor knowledge base:', error);
    throw error;
  }
}
