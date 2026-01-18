Run Full Workflow Test Script for MIVAA PDF Extractor with ssh mcp and monitor the process.

You need to use ssh mcp to connect to the server and then test and monitor the process from there, through the test file and console.

The script is named test_full_workflow.sh and use test_single_product=true

We need to ensure we start and finish with 100% completelition and we get back everything that worked.

Chunks
Images Extracted
Images generated Clips
Embeddings
Relations
MetaData Extracted

Ebverything should be working properly from start to finish. If you see issue, stop the job, fix the issue, and then restart the job. Do this until we finish with success and without issues.

I want you to be clever, identify the issues, work your mind around them to cover them as good as possible. 

We need to investigate all issues and fix them. The best possible way is to check a step, see if it is success, if it is then we move to next layer. If fails, we go back and see why, fix restart the process until the step in  the process if fixed 100% without errors.

The the job .log created at tmp folder you can then use
Product Checker: /tmp/check_products_created.sh - Monitors when products appear in database

To look for it and see the updates of the job. The script should take approx 30 - 45mins, if you see it taking it longer, stop the job and fix the issue. It is important to ensure that our Huggingface APIs' are been properly called, as checking the logs and they are not being called, then we need to fix the issue. So monitor all the processes that they are being called.

We need to ensure:

1. All the tracking steps are properly tracked, if you see we get no responses or not proper return on the job or we do not have enough checkpoints, report so we can build them

2. Read logs and report any warning and issues, so we can  fix

3. I need you to be sure that we run the discovery and we discovery 11 products. If not 11 discovered, cancel everything.  I need you to ensure that from those products, we only process 1 product, not more. If more staretd to be processed, cancel them all. I need you to ensure that when done, we update final-result.html file. If not, do not do anything else.
