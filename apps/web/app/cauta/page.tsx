import type {Metadata} from 'next';
import {Suspense} from 'react';
import TopicSearch from './TopicSearch';
import './topic-search.css';
export const metadata:Metadata={title:'Caută achiziții și documente',description:'Pornește de la un subiect, o instituție sau o firmă. Găsește achiziții și pagini din documentele publice pregătite.'};
export default function SearchPage(){return <Suspense fallback={<div className="topic-page"><h1>Caută un fir de urmărit.</h1><p role="status">Se pregătește căutarea…</p></div>}><TopicSearch/></Suspense>;}
