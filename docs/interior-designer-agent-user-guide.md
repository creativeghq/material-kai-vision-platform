# Interior Designer Agent - User Guide

## What is the Interior Designer Agent?

The Interior Designer Agent is your AI-powered interior design assistant that helps you:
- 🎨 Generate 3D interior design visualizations
- 📐 Analyze room layouts and spatial relationships
- 🏠 Match materials from our catalog to your designs
- 💰 Estimate costs for your design projects
- ✨ Get expert design recommendations

## Getting Started

### 1. Access the Agent

1. Navigate to **Agent Hub** (`/agent-hub`)
2. Select **Interior Designer Agent** from the dropdown
3. Start a new conversation or continue an existing one

### 2. Using Pre-Made Prompts

Click the **✨ Sparkles button** in the input area to open the Prompt Library:
- Browse curated design prompts
- Search by keywords
- Filter by category
- Click to insert into your message

## Key Features

### 🖼️ Room Image Analysis

**Upload a photo of your room and ask:**
- "Analyze this space and suggest improvements"
- "What materials would work well in this room?"
- "Check if this layout meets accessibility standards"

**The agent will:**
- Analyze room dimensions and layout
- Identify natural light sources
- Suggest material improvements
- Provide accessibility compliance report

---

### 🎨 3D Design Generation

**Request design visualizations:**
- "Generate a modern minimalist bedroom design"
- "Create a Scandinavian-style living room"
- "Show me a contemporary kitchen with oak cabinets"

**You can specify:**
- Room type (bedroom, living room, kitchen, bathroom, office)
- Design style (modern, minimalist, industrial, Scandinavian, traditional)
- Specific materials or colors
- Reference images for image-to-image generation

**The agent will:**
- Generate multiple design variations
- Match materials from our catalog
- Provide quality assessments
- Show processing details

---

### 🏠 Material Matching

**After generating designs, ask:**
- "What materials are used in this design?"
- "Find similar materials in our catalog"
- "Show me alternatives for the flooring"

**The agent will:**
- Search using multi-vector embeddings (6 types)
- Show matched materials with images and prices
- Provide technical specifications
- Suggest alternatives

---

### 💰 Cost Estimation

**Get pricing for your designs:**
- "Estimate the cost of these materials"
- "What's the budget for this design?"
- "Calculate total cost including installation"

**The agent will:**
- Itemize material costs
- Calculate quantities and units
- Provide total estimates
- Suggest budget-friendly alternatives

---

## Example Conversations

### Example 1: Complete Room Redesign

**You:** [Upload room photo] "I want to redesign this bedroom in a modern minimalist style. What do you suggest?"

**Agent:** 
1. Analyzes your space using Spaceformer
2. Provides layout recommendations
3. Suggests material improvements
4. Offers to generate 3D visualizations

**You:** "Yes, generate some design options"

**Agent:**
1. Creates multiple 3D designs
2. Shows matched materials
3. Provides cost estimates

---

### Example 2: Material Selection

**You:** "I'm looking for oak flooring for a 20 sqm living room"

**Agent:**
1. Searches material catalog
2. Shows oak flooring options with images
3. Provides pricing per sqm
4. Calculates total cost for 20 sqm

---

### Example 3: Accessibility Check

**You:** [Upload room photo] "Does this layout meet accessibility standards?"

**Agent:**
1. Analyzes doorway widths
2. Checks clear floor space
3. Evaluates lighting adequacy
4. Provides compliance report with recommendations

---

## Tips for Best Results

### 📸 Image Upload Tips
- Use well-lit photos
- Capture the entire room if possible
- Include multiple angles for better analysis
- Avoid heavy filters or editing

### 💬 Prompt Writing Tips
- Be specific about style preferences
- Mention budget constraints upfront
- Specify room dimensions if known
- Include any existing furniture to keep

### 🎯 Getting Better Recommendations
- Provide context (e.g., "for a family with young children")
- Mention any constraints (e.g., "rental property, can't change walls")
- Ask follow-up questions to refine designs
- Request alternatives if first suggestions don't fit

---

## Understanding the Results

### 3D Design Display

**Tabs:**
- **3D Images** - Carousel of generated designs with thumbnails
- **Spatial Analysis** - Layout metrics and recommendations
- **Materials** - Grid of matched materials with prices

**Controls:**
- ◀️ ▶️ Navigate between images
- 📥 Download individual images
- 🔍 Click materials for details

### Cost Estimates

**Breakdown includes:**
- Material name and quantity
- Unit price
- Subtotal per material
- Total cost in USD
- Currency conversion (if applicable)

---

## Advanced Features

### Image-to-Image Generation

**Upload a reference image:**
"Generate a design similar to this image but with modern materials"

**The agent will:**
- Use your image as a reference
- Apply specified style modifications
- Match materials from catalog

### Multi-Room Projects

**Plan entire spaces:**
"Design a cohesive look for my bedroom, bathroom, and walk-in closet"

**The agent will:**
- Maintain style consistency
- Suggest complementary materials
- Provide combined cost estimates

---

## Troubleshooting

### "No materials found"
- Try broader search terms
- Use different search strategies (color, texture, style)
- Check if materials are in your workspace catalog

### "Generation failed"
- Check image quality and format
- Simplify your prompt
- Try a different AI model
- Contact support if issue persists

### "Cost estimate unavailable"
- Some materials may not have pricing data
- Request manual quote from sales team
- Check product metadata in catalog

---

## Privacy and Data

- All conversations are saved to your workspace
- Images are stored securely in Supabase storage
- Design data is private to your workspace
- You can export or delete conversations anytime

---

## Support

Need help?
- Check the [Testing Guide](./interior-designer-agent-testing.md) for technical details
- Contact support at support@materialshub.gr
- Join our community forum for tips and inspiration

---

## What's Next?

The Interior Designer Agent is continuously improving with:
- More AI models for generation
- Enhanced material matching algorithms
- Better cost estimation accuracy
- Additional design styles and templates

Stay tuned for updates! 🚀

