import os
import random

notes_data = {
    "Strategy": [
        ("Business Plan", "Our main business plan for the coffee shop. Focus on local community and organic beans. Mentions [[Competitor Analysis]] and [[Marketing Strategy]]."),
        ("Competitor Analysis", "Local competitors include Starbucks and Joe's Cafe. We need a better [[Marketing Strategy]]."),
        ("Marketing Strategy", "We will use social media and local events. Budget is detailed in [[Financial Projections]]."),
        ("Expansion Plans", "Future plans to open a second location. Depends on [[Financial Projections]] and [[Staffing Needs]]."),
        ("Brand Identity", "Our brand is cozy, organic, and welcoming. Relates to our [[Marketing Strategy]]."),
    ],
    "Finance": [
        ("Financial Projections", "Expected revenue for year 1 is $100k. See [[Budget 2027]]."),
        ("Budget 2027", "Detailed breakdown of costs. Includes [[Equipment Costs]] and [[Payrolling]]."),
        ("Equipment Costs", "Espresso machine, grinders, etc. Sourced from [[Vendor List]]."),
        ("Payrolling", "Paying employees. Handled by [[HR Policies]]."),
        ("Tax Planning", "We need to consult a CPA. See [[Financial Projections]]."),
        ("Investor Pitch", "Slides for potential investors. Highlights our [[Business Plan]] and [[Financial Projections]]."),
    ],
    "Operations": [
        ("Vendor List", "List of suppliers for beans and pastries. Mentioned in [[Equipment Costs]]."),
        ("Inventory Management", "How we track beans and cups. Affects [[Budget 2027]]."),
        ("Daily Routine", "Opening and closing procedures. Follows [[HR Policies]]."),
        ("Menu Ideas", "New seasonal drinks. See [[Vendor List]] for ingredients."),
        ("Store Layout", "Floor plan for the cafe. Designed to optimize [[Daily Routine]]."),
        ("Maintenance Log", "Keeping the espresso machine running. Mentioned in [[Equipment Costs]]."),
    ],
    "HR": [
        ("HR Policies", "Rules for employees. See [[Payrolling]]."),
        ("Staffing Needs", "We need 3 baristas and 1 manager. Affects [[Payrolling]]."),
        ("Training Manual", "How to make a latte. Part of [[HR Policies]]."),
        ("Employee Feedback", "Quarterly reviews. See [[HR Policies]]."),
        ("Interview Questions", "Questions for new baristas. Relates to [[Staffing Needs]]."),
        ("Shift Scheduling", "Who works when. Optimized for [[Daily Routine]]."),
        ("Team Building", "Monthly events for staff. Affects [[Employee Feedback]]."),
        ("Emergency Contacts", "Who to call in an emergency. Important for [[Daily Routine]].")
    ]
}

os.makedirs("notes", exist_ok=True)

for group, notes in notes_data.items():
    folder = os.path.join("notes", group)
    os.makedirs(folder, exist_ok=True)
    for title, content in notes:
        with open(os.path.join(folder, f"{title}.md"), "w", encoding="utf-8") as f:
            f.write(f"# {title}\n\n{content}\n")

print("Created 25 notes in 'notes' directory.")
